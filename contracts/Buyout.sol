// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

/// Buyout is a shotgun clause / buy-sell agreement to allow holders to acquire
/// all other outstanding tokens.
///
/// @dev totalSupply() is currently frozen at start of offer
contract Buyout is Initializable {
    using SafeMath for uint256;

    event Surrendered(uint256 tokens, uint256 funds);

    enum Status {
        NEW, // Buyout not offered yet
        OPEN, // Buyout offer is currently open
        COUNTERED, // Fails, counter-offerers can claim listing tokens
        SUCCESS // Success, listing token holders can surrender
        // tokens in exchange for funding token
    }

    address public offerer; // Wallet proposing to buy out
    bool _offererRefunded; // After failure, offerer refunded?

    IERC20 public listingToken; // ERC20 token representing NFT
    IERC20 public fundingToken; // ERC20 token used for funding

    uint256 offerListingAmount; // Offerer's listing tokens
    uint256 offerFundingAmount; // Funding offer for outstanding tokens
    uint256 outstandingTokens; // Outstanding tokens (supply - offerer's)

    uint256 public end; // Expiry date of buyout offer
    uint256 public counterOfferTarget; // Counter offer target (funding tokens)
    uint256 public counterOfferAmount; // Current counter offers (funding tokens)

    uint256 numCounterOffers; // Number of counter offers (wallets)
    mapping(uint256 => address) counterOfferWallets; // List of wallets
    mapping(address => uint256) counterOffers; // Per-wallet offer amount
    mapping(address => bool) counterOffersRefunded; // If wallet was refunded

    modifier onlyStatus(Status s) {
        require(status() == s, "BAD_STATUS");
        _;
    }

    modifier onlyOfferer() {
        require(msg.sender == offerer, "OFFERER_ONLY");
        _;
    }

    function initialize(IERC20 _listingToken, IERC20 _fundingToken) public {
        listingToken = IERC20(_listingToken);
        fundingToken = IERC20(_fundingToken);
    }

    function status() public view returns (Status s) {
        if (offerer == address(0)) s = Status.NEW;
        else if (counterOfferAmount >= counterOfferTarget) s = Status.COUNTERED;
        else if (block.timestamp < end) s = Status.OPEN;
        else s = Status.SUCCESS;
    }

    function offer(uint256 listingAmount, uint256 fundingAmount)
        public
        onlyStatus(Status.NEW)
    {
        offerer = msg.sender;

        uint256 listingAllowance = listingToken.allowance(
            msg.sender,
            address(this)
        );
        require(listingAllowance >= listingAmount, "TOKEN_ALLOWANCE_LOW");
        uint256 fundingAllowance = fundingToken.allowance(
            msg.sender,
            address(this)
        );
        require(fundingAllowance >= fundingAmount, "FUNDING_ALLOWANCE_LOW");

        require(listingAmount > 100, "TOKEN_OFFER_LOW");
        require(fundingAmount > 100, "FUNDING_OFFER_LOW");

        offerListingAmount = listingAmount;
        offerFundingAmount = fundingAmount;

        uint256 listingSupply = listingToken.totalSupply();

        // tokens offerer is proposing to buy with offerFundingAmount
        outstandingTokens = listingSupply.sub(offerListingAmount);

        // counter offers must hit this target
        counterOfferTarget = offerFundingAmount.mul(offerListingAmount).div(
            outstandingTokens
        );

        end = block.timestamp + 14 days;

        assert(
            listingToken.transferFrom(msg.sender, address(this), listingAmount)
        );
        assert(
            fundingToken.transferFrom(msg.sender, address(this), fundingAmount)
        );
    }

    // Make a counter offer, capped at remaining target.
    function counterOffer(uint256 amount) public onlyStatus(Status.OPEN) {
        require(amount > 0, "COUNTEROFFER_TOO_LOW");
        uint256 allowance = fundingToken.allowance(msg.sender, address(this));
        require(allowance >= amount, "FUNDING_ALLOWANCE_TOO_LOW");

        uint256 remaining = counterOfferTarget.sub(counterOfferAmount);

        if (amount > remaining) amount = remaining;

        // add address if unknown
        if (counterOffers[msg.sender] == 0)
            counterOfferWallets[numCounterOffers++] = msg.sender;

        counterOfferAmount += amount;
        counterOffers[msg.sender] += amount;

        assert(fundingToken.transferFrom(msg.sender, address(this), amount));
    }

    // Withdraw listing tokens from failed buyout, based on pro-rata
    // counter offer amount
    function withdrawTokens() public onlyStatus(Status.COUNTERED) {
        require(counterOffers[msg.sender] > 0, "NOT_COUNTEROFFERER");
        require(counterOffersRefunded[msg.sender] == false, "ALREADY_REFUNDED");
        counterOffersRefunded[msg.sender] = true;

        uint256 amount = counterOffers[msg.sender].mul(offerListingAmount).div(
            counterOfferAmount
        );

        // send listing tokens to counter offerer
        assert(listingToken.transfer(msg.sender, amount));
    }

    // Withdraw funding tokens from failed buyout
    function withdrawFunds() public onlyStatus(Status.COUNTERED) onlyOfferer {
        require(_offererRefunded == false, "ALREADY_REFUNDED");

        _offererRefunded = true;

        // return funds to offerer
        assert(fundingToken.transfer(offerer, offerFundingAmount));
    }

    // Withdraw counter offer funds if buyout succeeds and counter offers are
    // insufficient
    function withdrawCounterOffer() public onlyStatus(Status.SUCCESS) {
        require(counterOffers[msg.sender] > 0, "NOT_COUNTEROFFERER");
        require(counterOffersRefunded[msg.sender] == false, "ALREADY_REFUNDED");
        counterOffersRefunded[msg.sender] = true;

        uint256 amount = counterOffers[msg.sender];

        // return funds to counter offerer
        assert(fundingToken.transfer(msg.sender, amount));
    }

    // Swap listing tokens for buyout offer
    function surrenderTokens(uint256 amount) public onlyStatus(Status.SUCCESS) {
        require(amount > 0, "TOKENS_LOW");
        uint256 allowance = listingToken.allowance(msg.sender, address(this));
        require(allowance >= amount, "TOKEN_ALLOWANCE_LOW");

        uint256 funds = amount.mul(offerFundingAmount).div(outstandingTokens);

        // take `amount` listing tokens and return `funds` funding tokens
        assert(listingToken.transferFrom(msg.sender, address(this), amount));
        assert(fundingToken.transfer(msg.sender, funds));

        emit Surrendered(amount, funds);
    }
}
