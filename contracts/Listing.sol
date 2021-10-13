// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.2;

import "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/IERC721Metadata.sol";

import "./LoanToken.sol";
import "./Buyout.sol";
import "./IRO.sol";
import "./Registry.sol";

contract Listing is Initializable, AccessControlUpgradeable, IERC721Receiver {
    enum Status {
        NEW, // Just listed
        IRO, // IRO phase of listing
        LIVE, // IRO over and not in a buyout
        BUYOUT, // Buyout in progress
        REDEEMED // Buyout successful
    }

    Registry registry; // contracts registry
    address owner; // user that added this listing
    bytes32 public name; // short name (up to 32 bytes)
    IERC20 public fundingToken; // ERC20 token used for funding
    uint256 public goal; // goal in funding_tokens
    bytes32 public media; // additional information (e.g. images) stored in IPFS
    IERC721Metadata nft_addr; // NFT representing the loan
    uint256 nft_id; // (i.e. holder represents creditor)
    LoanToken public listingToken; // ERC20 token used for fractionalization

    IRO public iro;

    uint256 public numBuyouts;
    mapping(uint256 => Buyout) public buyouts;

    modifier onlyNFTPresent() {
        require(
            address(nft_addr) != address(0) &&
                nft_addr.ownerOf(nft_id) == address(this),
            "NFT not present"
        );
        _;
    }

    bytes32 public constant DIRECTOR_ROLE = keccak256("DIRECTOR_ROLE");
    bytes32 public constant DUE_DILIGENCE_ROLE =
        keccak256("DUE_DILIGENCE_ROLE");
    bytes32 public constant LANDLORD_ROLE = keccak256("LANDLORD_ROLE");

    modifier onlyStatus(Status s) {
        require(status() == s, "Action is not allowed at this listing stage");
        _;
    }

    modifier onlyIROStatus(IRO.Status s) {
        require(iro.status() == s, "WRONG_IRO_STAGE");
        _;
    }

    function initialize(
        Registry _registry,
        address _owner,
        bytes32 _name,
        address _funding_token,
        uint256 _goal,
        bytes32 _media
    ) public {
        __AccessControl_init();

        registry = _registry;
        owner = _owner;
        name = _name;
        fundingToken = IERC20(_funding_token);
        goal = _goal;
        media = _media;

        _setupRole(DEFAULT_ADMIN_ROLE, _owner);
    }

    function status() public view returns (Status s) {
        if (address(iro) == address(0)) s = Status.NEW;
        else if (iro.status() != IRO.Status.DISTRIBUTION) s = Status.IRO;
        else if (numBuyouts == 0) s = Status.LIVE;
        else {
            Buyout.Status buyoutStatus = buyouts[numBuyouts - 1].status();

            if (buyoutStatus == Buyout.Status.OPEN) s = Status.BUYOUT;
            else if (buyoutStatus == Buyout.Status.SUCCESS) s = Status.REDEEMED;
            else s = Status.LIVE;
        }
    }

    /// @dev TODO verify landlord role
    function startIRO(address landlord)
        public
        onlyRole(DUE_DILIGENCE_ROLE)
        onlyStatus(Status.NEW)
    {
        iro = new IRO();
        iro.initialize(fundingToken, goal, landlord);
    }

    /// Register the NFT that represents the property. This also starts the
    /// distribution phase.
    function registerNFT(IERC721Metadata addr, uint256 id)
        public
        onlyRole(DIRECTOR_ROLE)
        onlyIROStatus(IRO.Status.AWAITING_NFT)
    {
        nft_addr = addr;
        nft_id = id;
    }

    /// Start distribution phase of IRO
    function onERC721Received(
        address,
        address,
        uint256 tokenId,
        bytes memory
    ) public override returns (bytes4 selector) {
        require(address(nft_addr) == msg.sender, "Wrong NFT contract");
        require(nft_id == tokenId, "Wrong NFT ID");
        require(
            address(this) == nft_addr.ownerOf(nft_id),
            "NFT not transferred"
        );

        _fractionalize();
        iro.enableDistribution(IERC20(address(listingToken)));

        selector = this.onERC721Received.selector;
    }

    function startBuyout() public onlyStatus(Status.LIVE) {
        uint256 id = numBuyouts++;

        Buyout buyout = new Buyout();
        buyout.initialize(IERC20(address(listingToken)), fundingToken);

        buyouts[id] = buyout;
    }

    function claimNFT() public onlyStatus(Status.REDEEMED) {
        require(msg.sender == buyouts[numBuyouts - 1].offerer(), "NOT_OFFERER");
        nft_addr.safeTransferFrom(address(this), msg.sender, nft_id);
    }

    function _fractionalize() public {
        require(address(listingToken) == address(0), "ALREADY_FRACTIONALIZED");

        BeaconProxy proxy = new BeaconProxy(address(registry.loan_token()), "");
        listingToken = LoanToken(address(proxy));
        listingToken.initialize("BrickToken", "BRICK", goal);
        listingToken.transfer(address(iro), goal);
    }
}
