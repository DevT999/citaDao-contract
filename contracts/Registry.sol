// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import "./LoanNFT.sol";

contract Registry is Initializable {
    UpgradeableBeacon public listing;
    UpgradeableBeacon public loan_token;
    LoanNFT public nft;

    function initialize(
        address _impl_listing,
        LoanNFT _nft,
        address _impl_loan_token
    ) public {
        listing = new UpgradeableBeacon(_impl_listing);
        nft = _nft;
        loan_token = new UpgradeableBeacon(_impl_loan_token);
    }
}
