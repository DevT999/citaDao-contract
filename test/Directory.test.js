const { ethers, waffle } = require('hardhat');
const { deployContract } = waffle;
const { expect } = require('chai');

const { to_bytes32 } = require('./utils.js');

describe('Directory', _ => {
  let Registry, Directory, Listing, LoanNFT;
  let owner, other;

  const name = to_bytes32('TestName');
  const funding_token = '0x4242424242424242424242424242424242424242';
  const goal = 42;
  const media = to_bytes32('media');

  before(async function () {
    [owner, other] = await ethers.getSigners();

    Registry = await ethers.getContractFactory('Registry');
    Directory = await ethers.getContractFactory('Directory');
    Listing = await ethers.getContractFactory('Listing');
    LoanNFT = await ethers.getContractFactory('LoanNFT');
  });

  beforeEach(async function() {
    const loan_nft = this.loan_nft = await LoanNFT.deploy();
    await loan_nft.initialize();

    const dummy = loan_nft.address; // random contract address

    // dummy implementation deployment
    const listing = this.listing = await Listing.deploy();
    // initialize to prevent it from being taken over
    await listing.initialize(dummy, owner.address, name, funding_token, goal, media);

    const registry = await Registry.deploy();
    registry.initialize(listing.address, dummy, dummy);

    const directory = this.directory = await Directory.deploy();
    await directory.initialize(registry.address, owner.address);
  });

  it('allows new listing to be created', async function() {
    await this.directory.newListing(name, funding_token, goal, media);

    const logs = await this.directory.queryFilter('NewListing');
    const id = logs[0].args.id;
    expect(id).to.equal(0);

    const address = await this.directory.listings(id);
    expect(address).to.be.properAddress;

    const listing = await Listing.attach(address);
    expect(await listing.name()).to.equal(name);
    expect((await listing.fundingToken()).toLowerCase()).to.equal(funding_token);
    expect(await listing.goal()).to.equal(goal);
    expect(await listing.media()).to.equal(media);
  });

  it('ensures each listing has its own data / contract address', async function() {
    const dir = this.directory;

    const create = async (id, goal) => {
      const name = to_bytes32(`TestName_${id}`);

      await expect(dir.newListing(name, funding_token, goal, media))
        .to.emit(dir, 'NewListing')
        .withArgs(id);

      return await Listing.attach(await this.directory.listings(id));
    };

    for (let i = 0; i < 3; i++) {
      const listing = await create(i, 1000000 + i);

      expect(await listing.name()).to.equal(to_bytes32(`TestName_${i}`));
      expect(await listing.goal()).to.equal(1000000 + i);
    }
  });
});
