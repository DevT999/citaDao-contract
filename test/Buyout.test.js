const { ethers, waffle } = require('hardhat');
const { deployContract } = waffle;
const { expect } = require('chai');

const Status = { // TODO: keep in sync with Buyout.sol
  NEW: 0,
  OPEN: 1,
  COUNTERED: 2,
  SUCCESS: 3,
}

const DAYS_14 = 14 * 24 * 60 * 60;

describe('Buyout', _ => {
  let Buyouy, LoanToken;
  let owner, offerer, counterofferer, counterofferer2;

  before(async function () {
    [owner, offerer, counterofferer, counterofferer2] = await ethers.getSigners();

    Buyout = await ethers.getContractFactory('Buyout');
    LoanToken = await ethers.getContractFactory('LoanToken');
  });

  beforeEach(async function() {
    // reuse ERC20 as mock
    const funding_token = this.funding_token = await LoanToken.deploy();
    await funding_token.initialize('StableCoin', 'STBC', 1e9);
    await funding_token.transfer(offerer.address, 10e6);
    await funding_token.transfer(counterofferer.address, 1e6);
    await funding_token.transfer(counterofferer2.address, 1e6);

    const listing_token = this.listing_token = await LoanToken.deploy();
    await listing_token.initialize('PropertyCoin', 'PROP', 1e6);
    await listing_token.transfer(offerer.address, 8e5);
    await listing_token.transfer(counterofferer.address, 1e5);
    await listing_token.transfer(counterofferer2.address, 1e5);

    const buyout = this.buyout = await Buyout.deploy();
    await buyout.initialize(listing_token.address, funding_token.address);
  });

  it('starts as new', async function() {
    expect((await this.buyout.status()).toString())
      .to.equal(Status.NEW.toString());
  });

  it('requires allowances', async function() {
    await expect(this.buyout.connect(offerer).offer(100, 100))
      .to.be.revertedWith('TOKEN_ALLOWANCE_LOW');

    await this.listing_token.connect(offerer).approve(this.buyout.address, 8e5);

    await expect(this.buyout.connect(offerer).offer(100, 100))
      .to.be.revertedWith('FUNDING_ALLOWANCE_LOW');
  });

  it('accepts buyout offer', async function() {
    const { buyout, funding_token, listing_token } = this;

    await funding_token.connect(offerer).approve(buyout.address, 10e6);
    await listing_token.connect(offerer).approve(buyout.address, 8e5);
    await buyout.connect(offerer).offer(8e5, 10e6);

    expect(await funding_token.balanceOf(offerer.address)).to.equal(0);
    expect(await listing_token.balanceOf(offerer.address)).to.equal(0);
    expect(await funding_token.balanceOf(buyout.address)).to.equal(10e6);
    expect(await listing_token.balanceOf(buyout.address)).to.equal(8e5);

    expect((await buyout.status()).toString())
      .to.equal(Status.OPEN.toString());
    expect(await buyout.counterOfferTarget()).to.equal(40e6);
  });

  describe('after offer starts', _ => {
    beforeEach(async function() {
      const { buyout, funding_token, listing_token } = this;

      await funding_token.connect(offerer).approve(buyout.address, 10e6);
      await listing_token.connect(offerer).approve(buyout.address, 8e5);
      await buyout.connect(offerer).offer(8e5, 10e6);
    });

    it('succeeds after 14 days with no counter offers', async function() {
      const { buyout, funding_token, listing_token } = this;

      await ethers.provider.send('evm_increaseTime', [DAYS_14]);
      await ethers.provider.send('evm_mine');

      expect((await buyout.status()).toString())
        .to.equal(Status.SUCCESS.toString());

      expect(await funding_token.balanceOf(offerer.address)).to.equal(0);
      expect(await listing_token.balanceOf(offerer.address)).to.equal(0);
      expect(await funding_token.balanceOf(buyout.address)).to.equal(10e6);
      expect(await listing_token.balanceOf(buyout.address)).to.equal(8e5);

      expect(await buyout.counterOfferTarget()).to.equal(40e6);
    });

    it('accepts counter offers', async function() {
      const { buyout, funding_token } = this;

      await funding_token.connect(counterofferer).approve(buyout.address, 1e6);
      await funding_token.connect(counterofferer2).approve(buyout.address, 2e5);

      await buyout.connect(counterofferer).counterOffer(1e5);

      expect((await buyout.status()).toString())
        .to.equal(Status.OPEN.toString());
      expect(await buyout.counterOfferAmount()).to.equal(1e5);

      await buyout.connect(counterofferer2).counterOffer(2e5);

      expect((await buyout.status()).toString())
        .to.equal(Status.OPEN.toString());
      expect(await buyout.counterOfferAmount()).to.equal(3e5);

      await buyout.connect(counterofferer).counterOffer(9e5);

      expect((await buyout.status()).toString())
        .to.equal(Status.OPEN.toString());
      expect(await buyout.counterOfferAmount()).to.equal(12e5);
    });

    it('succeeds after 14 days with insufficient counter_offers', async function() {
      const { buyout, funding_token, listing_token } = this;

      await funding_token.connect(counterofferer).approve(buyout.address, 1e6);
      await buyout.connect(counterofferer).counterOffer(1e6);

      await ethers.provider.send('evm_increaseTime', [DAYS_14]);
      await ethers.provider.send('evm_mine');

      expect((await buyout.status()).toString())
        .to.equal(Status.SUCCESS.toString());

      expect(await funding_token.balanceOf(buyout.address)).to.equal(11e6);
      expect(await listing_token.balanceOf(buyout.address)).to.equal(8e5);
    });
  });
});
