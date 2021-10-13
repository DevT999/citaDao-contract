/**
 * @type import('hardhat/config').HardhatUserConfig
 */

// require("@nomiclabs/hardhat-waffle");
// require('@openzeppelin/hardhat-upgrades');
// require('solidity-coverage');
// require('hardhat-contract-sizer');

// module.exports = {
//   solidity: {
//     version: "0.8.4",
//     settings: {
//       optimizer: {
//         enabled: true,
//         runs: 3
//       }
//     }
//   }
// };

// actually above doesn't work for compiling, 'cause sol version is 0.8.0 and 0.8.2(for 2 contracts)

require('dotenv').config();
require("@nomiclabs/hardhat-ethers");
require('hardhat-contract-sizer');
require('solidity-coverage');
const { API_URL, PRIVATE_KEY } = process.env;
module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.8.0",
      },
      {
        version: "0.8.2",
        settings: {},
      },
    ],
    overrides: {
      "contracts/Listing.sol": {
        version: "0.8.2",
        settings: { 
          optimizer: {
            enabled: true
          }
        }
      },
      "contracts/Directory.sol": {
        version: "0.8.2",
        settings: { 
          optimizer: {
            enabled: true
          }
        }
      },
    }
  },
  defaultNetwork: "rinkeby",
  networks: {
    hardhat: {},
    rinkeby: {
        url: API_URL,
        accounts: [`0x${PRIVATE_KEY}`],
        gas: 2100000,
        gasPrice: 8000000000
    }
  },
  contractSizer: {
    alphaSort: true,
    disambiguatePaths: false,
    runOnCompile: true,
    strict: true,
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
}
