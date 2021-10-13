const { ethers, waffle } = require('hardhat');
const { expect } = require('chai');

const { to_bytes32 } = require('./utils.js');

describe('Full end-to-end', _ => {
  let Registry, Buyout, Directory, ERC20, Listing, LoanNFT, LoanToken, IRO;
  let citadao, landlord, dd, funder, funder2, buyout;
  let funding_token;

  const dummy = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
  const name = to_bytes32('TestName');
  const goal = 1_000_000;
  const media = to_bytes32('media');

  before(async function () {
    [citadao, landlord, dd, director, funder, funder2, buyout] = await ethers.getSigners();

    Registry = await ethers.getContractFactory('Registry');
    Buyout = await ethers.getContractFactory('Buyout');
    Directory = await ethers.getContractFactory('Directory');
    Listing = await ethers.getContractFactory('Listing');
    LoanNFT = await ethers.getContractFactory('LoanNFT');
    LoanToken = await ethers.getContractFactory('LoanToken');
    IRO = await ethers.getContractFactory('IRO');
    ERC20 = await ethers.getContractFactory('LoanToken');
  });

  beforeEach(async function() {
    const listing_token = await LoanToken.deploy();
    await listing_token.initialize('BrickToken', 'BRICK', 1e9);

    const funding_token = this.funding_token = await ERC20.deploy();
    await funding_token.initialize('StableCoin', 'STBC', 1e9);

    const nft = this.nft = await LoanNFT.deploy();
    await nft.initialize();

    // dummy implementation deployment
    const listing = await Listing.deploy();
    // initialize to prevent it from being taken over
    await listing.initialize(dummy, citadao.address, name, funding_token.address, goal, media);

    const registry = await Registry.deploy();
    registry.initialize(listing.address, nft.address, listing_token.address);

    const directory = this.directory = await Directory.deploy();
    await directory.initialize(registry.address, citadao.address);

    await this.directory.connect(landlord).newListing(name, funding_token.address, goal, media);
  });

  it('allows creating a new listing', async function() {
    const logs = await this.directory.queryFilter('NewListing');
    const id = logs[0].args.id;
    expect(id).to.equal(0);

    const address = await this.directory.listings(id);
    expect(address).to.be.properAddress;

    const listing = await Listing.attach(address);
    expect(await listing.name()).to.equal(name);
    expect(await listing.fundingToken()) .to.equal(this.funding_token.address);
    expect(await listing.goal()).to.equal(goal);
    expect(await listing.media()).to.equal(media);
  });

  describe('IRO', async function() {
    beforeEach(async function() {
      let listing;

      const address = await this.directory.listings(0);
      this.listing = await Listing.attach(address);

      const DUE_DILIGENCE_ROLE = await this.listing.DUE_DILIGENCE_ROLE();
      await this.listing.grantRole(DUE_DILIGENCE_ROLE, dd.address);
      this.listing.connect(dd).startIRO(landlord.address);
    });

    it('starts', async function() {
      expect((await this.listing.status()).toString()).to.equal('1');
    });

    describe('Funds', async function() {
      beforeEach(async function() {
        this.iro = await IRO.attach(await this.listing.iro());

        await this.funding_token.transfer(funder.address, 1_200_000);
        await this.funding_token.transfer(funder2.address, 1_000_000);

        await this.funding_token.connect(funder).approve(this.iro.address, 1e6);
        await this.iro.connect(funder).commit(800_000);

        await this.funding_token.connect(funder2).approve(this.iro.address, 1e6);
        await this.iro.connect(funder2).commit(200_000);
      });

      it('can be committed', async function() {
        expect(await this.funding_token.balanceOf(funder.address)).to.equal(400_000);
        expect(await this.funding_token.balanceOf(funder2.address)).to.equal(800_000);
        expect(await this.funding_token.balanceOf(this.iro.address)).to.equal(1_000_000);
        expect(await this.iro.committed()).to.equal(1_000_000);

        const DAYS_28 = 28 * 24 * 60 * 60;

        await ethers.provider.send('evm_increaseTime', [DAYS_28]);
        await ethers.provider.send('evm_mine');

        expect((await this.iro.status.call()).toString()).to.equal('2');
      });

      describe('NFT', async function() {
        beforeEach(async function() {
          const DAYS_28 = 28 * 24 * 60 * 60;

          await ethers.provider.send('evm_increaseTime', [DAYS_28]);
          await ethers.provider.send('evm_mine');

          await this.nft.safeMint(director.address, "");
          await this.listing.grantRole(this.listing.DIRECTOR_ROLE(), director.address);
          await this.listing.connect(director).registerNFT(this.nft.address, 0);
          await this.nft.connect(director)
            ['safeTransferFrom(address,address,uint256)'](director.address, this.listing.address, 0);

          const addr = await this.listing.listingToken();
          this.listing_token = await LoanToken.attach(addr);
        });

        it('can be registered, presented & fractionalized', async function() {
          expect(await this.nft.ownerOf(0)).to.equal(this.listing.address);
          expect((await this.iro.status.call()).toString()).to.equal('3');
          expect((await this.listing.status.call()).toString()).to.equal('2');
          expect(await this.listing_token.balanceOf(this.iro.address)).to.equal(goal);
        });

        describe('Funds and Tokens', async function() {
          beforeEach(async function() {
            await this.iro.connect(landlord).withdrawFunds();
            await this.iro.connect(funder).withdrawTokens();
            await this.iro.connect(funder2).withdrawTokens();
          });

          it('can be withdrawn', async function() {
            expect(await this.funding_token.balanceOf(landlord.address))
              .to.equal(1_000_000);
            expect(await this.listing_token.balanceOf(funder.address))
              .to.equal(800_000);
            expect(await this.listing_token.balanceOf(funder2.address))
              .to.equal(200_000);
          });

          describe('Buyouts', async function() {
            beforeEach(async function() {
              await this.listing.connect(funder).startBuyout();

              const addr = await this.listing.buyouts(0);;
              this.buyout = Buyout.attach(addr);

              await this.listing_token.connect(funder).approve(this.buyout.address, 800_000);
              await this.funding_token.connect(funder).approve(this.buyout.address, 400_000);
              await this.buyout.connect(funder).offer(800_000, 400_000);

              await this.funding_token.connect(funder2).approve(this.buyout.address, 800_000);
              await this.buyout.connect(funder2).counterOffer(800_000);
            });

            it('can be initiated', async function() {
              expect(await this.listing.numBuyouts()).to.equal(1);
              expect(await this.buyout.offerer()).to.equal(funder.address);
              expect(await this.listing_token.balanceOf(funder.address)).to.equal(0);
              expect(await this.funding_token.balanceOf(funder.address)).to.equal(0);
              expect(await this.listing_token.balanceOf(funder2.address)).to.equal(200_000);
              expect(await this.funding_token.balanceOf(funder2.address)).to.equal(0);
            });

            describe('Funds, tokens & NFT', async function() {
              beforeEach(async function() {
                const DAYS_14 = 14 * 24 * 60 * 60;

                await ethers.provider.send('evm_increaseTime', [DAYS_14]);
                await ethers.provider.send('evm_mine');

                await this.listing.connect(funder).claimNFT();
                await this.buyout.connect(funder2).withdrawCounterOffer();
                await this.listing_token.connect(funder2).approve(this.buyout.address, 1_000);
                await this.buyout.connect(funder2).surrenderTokens(1_000);
              });

              it('can be withdrawn after successful buyout', async function() {
                expect(await this.nft.ownerOf(0)).to.equal(funder.address);
                expect(await this.funding_token.balanceOf(funder2.address)).to.equal(802_000);
                expect(await this.listing_token.balanceOf(funder2.address)).to.equal(199_000);
              });
            });
          });
        });
      });
    });
  });
});
