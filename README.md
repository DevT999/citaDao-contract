Citadao Contracts
=================

# create environment file
create .env under root directory and create same structure as .env.example

# compile contract
npx hardhat compile
npx hardhat run scripts/deploy.js --network {network name}


FYI, I set config for only rinkeby testnet for now