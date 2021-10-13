const { ethers, waffle } = require('hardhat');
const { deployContract } = waffle;
const { expect } = require('chai');

const { to_bytes32 } = require('./utils.js');

const Status = { // TODO: keep in sync with IRO.sol
  FUNDING: 0,
  FAILED: 1,
  AWAITING_NFT: 2,
  DISTRIBUTION: 3
}

const DAYS_15 = 15 * 24 * 60 * 60;

describe('IRO', _ => {
  let ERC20, IRO;
  let owner, funder;

  const name = to_bytes32('TestName');
  const funding_token = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
  const goal = 42;
  const media = to_bytes32('media');

  before(async function () {
    [owner, funder] = await ethers.getSigners();

    ERC20 = await ethers.getContractFactory('LoanToken');
    IRO = await ethers.getContractFactory('IRO');
  });

  beforeEach(async function() {
    this.iro = await IRO.deploy();
    await this.iro.initialize(funding_token, goal, owner.address);
  });

  it('sets the funding token and goal', async function() {
    const iro = this.iro;
    expect((await iro.fundingToken()).toLowerCase()).to.equal(funding_token);
    expect(await iro.goal()).to.equal(goal);
  });

  it('starts with funding status', async function() {
    expect(await this.iro.status()).to.equal(Status.FUNDING);
  });

  it('does not allow withdrawals', async function() {
    const iro_funder = this.iro.connect(funder);
    const iro_owner = this.iro.connect(owner);

    await expect(iro_funder.withdrawRefunds())
      .to.be.revertedWith('BAD_STATUS');
    await expect(iro_owner.withdrawFunds())
      .to.be.revertedWith('BAD_STATUS');
    await expect(iro_funder.withdrawFunds())
      .to.be.revertedWith('BAD_STATUS');
    await expect(iro_funder.withdrawTokens())
      .to.be.revertedWith('BAD_STATUS');
  });

  describe('Funding', _ => {
    const goal = 1000;

    before(async function () {
      [owner, funder, funder2] = await ethers.getSigners();
    });

    beforeEach(async function() {
      const erc20 = this.erc20 = await ERC20.deploy();
      await erc20.initialize('StableCoin', 'STBC', 1e9);
      await erc20.transfer(funder.address, 1e6);

      const iro = this.iro = await IRO.deploy();
      await iro.initialize(erc20.address, goal, owner.address);
    });

    it('has a minimum', async function() {
      await expect(this.iro.connect(funder).commit(0))
        .to.be.revertedWith('NO_COMMIT');
    });

    it('requires an allowance', async function() {
      await expect(this.iro.connect(funder).commit(100))
        .to.be.revertedWith('ALLOWANCE_LOW');
    });

    it('can be funded', async function() {
      await this.erc20.connect(funder).approve(this.iro.address, 1e6);
      await this.iro.connect(funder).commit(1000);
      expect(await this.erc20.balanceOf(funder.address)).to.equal(999000);
      expect(await this.iro.committed()).to.equal(1000);
      expect(await this.erc20.balanceOf(this.iro.address)).to.equal(1000);
    });

    it('fails after 28 days without sufficient funding', async function() {
      await ethers.provider.send('evm_increaseTime', [DAYS_15]);
      await ethers.provider.send('evm_mine');

      expect((await this.iro.status.call()).toString())
        .to.equal(Status.FUNDING.toString());

      await this.erc20.connect(funder).approve(this.iro.address, 1e6);
      await this.iro.connect(funder).commit(42);

      await ethers.provider.send('evm_increaseTime', [DAYS_15]);
      await ethers.provider.send('evm_mine');

      expect((await this.iro.status.call()).toString())
        .to.equal(Status.FAILED.toString());
    });

    it('ends after 28 days and waits for NFT with sufficient funding', async function() {
      await ethers.provider.send('evm_increaseTime', [DAYS_15]);
      await ethers.provider.send('evm_mine');

      expect((await this.iro.status.call()).toString())
        .to.equal(Status.FUNDING.toString());

      await this.erc20.connect(funder).approve(this.iro.address, 1e6);
      await this.iro.connect(funder).commit(1000);

      await ethers.provider.send('evm_increaseTime', [DAYS_15]);
      await ethers.provider.send('evm_mine');

      expect((await this.iro.status.call()).toString())
        .to.equal(Status.AWAITING_NFT.toString());
    });
  });

  describe('Withdrawals', _ => {
    const goal = 1000;

    before(async function () {
      [owner, funder, funder2] = await ethers.getSigners();
    });

    beforeEach(async function() {
      const erc20 = this.erc20 = await ERC20.deploy();
      await erc20.initialize('StableCoin', 'STBC', 1e9);
      await erc20.transfer(funder.address, 1e6);

      const iro = this.iro = await IRO.deploy();
      await iro.initialize(erc20.address, goal, owner.address);
    });

    it('has a minimum', async function() {
      await expect(this.iro.connect(funder).commit(0))
        .to.be.revertedWith('NO_COMMIT');
    });

    it('requires an allowance', async function() {
      await expect(this.iro.connect(funder).commit(100))
        .to.be.revertedWith('ALLOWANCE_LOW');
    });

    it('can be funded', async function() {
      await this.erc20.connect(funder).approve(this.iro.address, 1e6);
      await this.iro.connect(funder).commit(1000);
      expect(await this.erc20.balanceOf(funder.address)).to.equal(999000);
      expect(await this.iro.committed()).to.equal(1000);
      expect(await this.erc20.balanceOf(this.iro.address)).to.equal(1000);
    });

    it('fails after 28 days without sufficient funding', async function() {
      await ethers.provider.send('evm_increaseTime', [DAYS_15]);
      await ethers.provider.send('evm_mine');

      expect((await this.iro.status.call()).toString())
        .to.equal(Status.FUNDING.toString());

      await this.erc20.connect(funder).approve(this.iro.address, 1e6);
      await this.iro.connect(funder).commit(42);

      await ethers.provider.send('evm_increaseTime', [DAYS_15]);
      await ethers.provider.send('evm_mine');

      expect((await this.iro.status.call()).toString())
        .to.equal(Status.FAILED.toString());
    });

    it('ends after 28 days and waits for NFT with sufficient funding', async function() {
      await ethers.provider.send('evm_increaseTime', [DAYS_15]);
      await ethers.provider.send('evm_mine');

      expect((await this.iro.status.call()).toString())
        .to.equal(Status.FUNDING.toString());

      await this.erc20.connect(funder).approve(this.iro.address, 1e6);
      await this.iro.connect(funder).commit(1000);

      await ethers.provider.send('evm_increaseTime', [DAYS_15]);
      await ethers.provider.send('evm_mine');

      expect((await this.iro.status.call()).toString())
        .to.equal(Status.AWAITING_NFT.toString());
    });
  });
});
