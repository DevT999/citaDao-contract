async function main() {
    const tokenDeploy = await ethers.getContractFactory("Listing")
  
    // Start deployment, returning a promise that resolves to a contract object
    const myToken = await tokenDeploy.deploy()
    console.log("Token Contract deployed to address:", myToken.address)

    const NFTDeploy = await ethers.getContractFactory("LoanNFT")
  
    // Start deployment, returning a promise that resolves to a contract object
    const myNFT = await NFTDeploy.deploy()
    console.log("NFT Contract deployed to address:", myNFT.address)
}
  
main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error)
      process.exit(1)
})
  