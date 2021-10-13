// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/IERC721Metadata.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

contract IRO is Initializable {
    using SafeMath for uint256;

    enum Status {
        FUNDING, // Listing is being funded
        FAILED, // Goal not reached, contributors can pull funds
        AWAITING_NFT, // Awaiting NFT for distribution
        DISTRIBUTION // Success, contributors can pull tokens, owner can pull funds
    }

    struct Commitment {
        address addr; // Committment wallet
        uint256 amount; // Amount committed in funding token
    }

    IERC20 public fundingToken; // ERC20 token used for funding
    uint256 public goal; // goal in funding tokens
    address public landlord; // on success, only this address can claimm funds

    uint256 public end; // if non-zero, when funding period ends
    uint256 public committed; // amount committed
    uint256 numCommitments; // number of commitments
    mapping(uint256 => Commitment) commitments; // Should really be events
    mapping(address => uint256) walletCommitAmounts; // total amount by address

    // ERC20 token (fractions) used for distributions.
    // Set after NFT has been presented and distributions can start
    IERC20 public listingToken;

    modifier onlyStatus(Status s) {
        require(status() == s, "BAD_STATUS");
        _;
    }

    function initialize(
        IERC20 _funding_token,
        uint256 _goal,
        address _landlord
    ) public {
        landlord = _landlord;
        fundingToken = IERC20(_funding_token);
        goal = _goal;
        end = block.timestamp + 28 days;
    }

    function status() public view returns (Status s) {
        if (block.timestamp < end) s = Status.FUNDING;
        else if (committed < goal) s = Status.FAILED;
        else if (address(listingToken) == address(0)) s = Status.AWAITING_NFT;
        else s = Status.DISTRIBUTION;
    }

    // @dev Cap to goal
    function commit(uint256 amount) public onlyStatus(Status.FUNDING) {
        require(amount > 0, "NO_COMMIT");
        uint256 allowance = fundingToken.allowance(msg.sender, address(this));
        require(allowance >= amount, "ALLOWANCE_LOW");

        // Record commitment
        commitments[numCommitments++] = Commitment(msg.sender, amount);
        committed = committed.add(amount);
        walletCommitAmounts[msg.sender] += amount;

        assert(fundingToken.transferFrom(msg.sender, address(this), amount));
    }

    // @dev TODO onlyRole(DEFAULT_ADMIN_ROLE) {
    function enableDistribution(IERC20 _listingToken) public {
        listingToken = _listingToken;
    }

    /// In the event of a failed IRO (goal not hit within the 28-day window),
    /// withdraw committed funds in the event IRO fails to hit the target in the
    /// 28 day window.
    function withdrawRefunds() public onlyStatus(Status.FAILED) {
        uint256 amount = walletCommitAmounts[msg.sender];
        walletCommitAmounts[msg.sender] = 0;

        assert(fundingToken.transfer(msg.sender, amount));
    }

    function withdrawFunds() public onlyStatus(Status.DISTRIBUTION) {
        require(msg.sender == landlord, "NOT_LANDLORD");

        assert(fundingToken.transfer(landlord, goal));
    }

    /// @dev TODO funding token's decimals() may not match listing token's
    function withdrawTokens() public onlyStatus(Status.DISTRIBUTION) {
        uint256 amount = walletCommitAmounts[msg.sender];
        require(amount > 0, "NO_COMMITMENTS_OR_ALREADY_DISTRIBUTED");
        walletCommitAmounts[msg.sender] = 0;

        assert(listingToken.transfer(msg.sender, amount));
    }
}
