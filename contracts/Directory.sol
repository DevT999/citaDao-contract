// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.2;

import "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";
import "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

import "./Listing.sol";
import "./LoanNFT.sol";

contract Directory is Initializable {
    event NewListing(uint256 id);

    Registry registry;
    address owner;

    uint256 numListings;
    mapping(uint256 => Listing) public listings;

    function initialize(Registry _registry, address _owner) public {
        registry = _registry;
        owner = _owner;
    }

    // Create a new listing
    // @dev TODO limit by role, also use upgradeable proxy
    function newListing(
        bytes32 name,
        address funding_token,
        uint256 goal,
        bytes32 media
    ) public returns (uint256 listingID) {
        listingID = numListings++; // return value

        // TODO: alternatively consider abi.encodeWithSignature to initialize
        BeaconProxy proxy = new BeaconProxy(address(registry.listing()), "");
        Listing listing = Listing(address(proxy));

        // make sure all upgradeable contracts are initialized
        listing.initialize(registry, owner, name, funding_token, goal, media);

        listings[listingID] = listing;

        emit NewListing(listingID);
    }

    /// Mint NFT representing loan
    /// @dev Should limit via roles
    function mintNFT(string memory uri) public {
        LoanNFT nft = LoanNFT(address(registry.nft()));
        nft.safeMint(msg.sender, uri);
    }
}
