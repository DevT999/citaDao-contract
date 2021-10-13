const { ethers, waffle } = require('hardhat');
const { deployContract } = waffle;
const { expect } = require('chai');

const { to_bytes32 } = require('./utils.js');

const Status = { // TODO: keep in sync with Listing.sol
  NEW: 0,
  IRO: 1,
  LIVE: 2,
  BUYOUT: 3
}

describe('Listing', _ => {
  let ERC20, Listing;
  let owner, dd, director, landlord, other;

  const registry = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
  const name = to_bytes32('TestName');
  const funding_token = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
  const goal = 42;
  const media = to_bytes32('media');

  before(async function () {
    [owner, dd, director, landlord, other] = await ethers.getSigners();

    NFT = await ethers.getContractFactory('LoanNFT');
    Listing = await ethers.getContractFactory('Listing');
  });

  beforeEach(async function() {
    this.listing = await Listing.deploy();
    await this.listing.initialize(registry, owner.address, name, funding_token, goal, media);

    this.nft = await NFT.deploy();
    await this.nft.initialize();
  });

  it('sets the name, token, goal and media', async function() {
    expect(await this.listing.name()).to.equal(name);
    expect((await this.listing.fundingToken()).toLowerCase()).to.equal(funding_token);
    expect(await this.listing.goal()).to.equal(goal);
    expect(await this.listing.media()).to.equal(media);
  });

  it('starts with new status', async function() {
    expect((await this.listing.status()).toString())
      .to.equal(Status.NEW.toString());
  });

  it('can be started by due diligence role only', async function() {
    await expect(this.listing.connect(owner).startIRO(landlord.address))
      .to.be.revertedWith('AccessControl: account');

    await expect(this.listing.connect(other).startIRO(landlord.address))
      .to.be.revertedWith('AccessControl: account');

    let DUE_DILIGENCE_ROLE = await this.listing.DUE_DILIGENCE_ROLE();
    await this.listing.grantRole(DUE_DILIGENCE_ROLE, dd.address);
    await this.listing.connect(dd).startIRO(landlord.address);

    expect((await this.listing.status()).toString())
      .to.equal(Status.IRO.toString());
  });

  it('rejects NFT registration', async function() {
    let DUE_DILIGENCE_ROLE = await this.listing.DUE_DILIGENCE_ROLE();
    let DIRECTOR_ROLE = await this.listing.DIRECTOR_ROLE();

    await this.listing.grantRole(DUE_DILIGENCE_ROLE, dd.address);
    await this.listing.connect(dd).startIRO(landlord.address);

    await expect(this.listing.connect(director).registerNFT(this.nft.address, 0))
      .to.be.revertedWith('AccessControl: account');

    await this.listing.grantRole(DIRECTOR_ROLE, director.address);
    await expect(this.listing.connect(director).registerNFT(this.nft.address, 0))
      .to.be.revertedWith('WRONG_IRO_STAGE');
  });
});
