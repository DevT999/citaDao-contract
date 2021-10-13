const { ethers, upgrades, waffle } = require('hardhat');
const { deployContract } = waffle;
const { expect } = require('chai');

const { get_proxy_implementation, to_bytes32 } = require('./utils.js');

describe('Upgradeable Directory', _ => {
  let Registry, Directory, Listing, LoanNFT;
  // by default, deployProxy uses accounts[0] for proxy admin account
  let proxy_admin, owner, other;

  const name = to_bytes32('TestName');
  const funding_token = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
  const nft_token = '0x4242424242424242424242424242424242424242';
  const goal = 42;
  const media = to_bytes32('media');

  before(async function() {
    [ proxy_admin, owner, other ] = await ethers.getSigners();

    Registry = await ethers.getContractFactory('Registry');
    Directory = await ethers.getContractFactory('Directory');
    Listing = await ethers.getContractFactory('Listing');
    LoanNFT = await ethers.getContractFactory('LoanNFT');
  });

  // TODO make sure owner owns contracts

  beforeEach(async function() {
    const loan_nft = this.loan_nft = await upgrades.deployProxy(LoanNFT, []);

    const dummy = loan_nft.address; // random contract address

    // We use deployProxy to ensure our BeaconProxy implementation is
    // upgrade-safe
    const listing = await upgrades.deployProxy(Listing, [dummy, owner.address, name, funding_token, goal, media]);

    // Get proxy implementation which will be used by BeaconProxy
    const listing_impl = await get_proxy_implementation(listing.address);

    const registry = await Registry.deploy();
    registry.initialize(listing_impl, dummy, dummy);

    this.directory = await upgrades.deployProxy(Directory, [registry.address, owner.address]);
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
