module.exports = {
  get_proxy_implementation,
  to_bytes32,
};

function to_bytes32(str) {
  return `0x${Buffer.from(str, 'utf8').toString('hex')}`.padEnd(66, 0);
}

// bytes32(uint256(keccak256('eip1967.proxy.implementation')) - 1))
const EIP1967_PROXY_IMPL = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';

async function get_proxy_implementation(proxy) {
  const impl = await ethers.provider.getStorageAt(proxy, EIP1967_PROXY_IMPL);

  // Strip off leading 12 bytes
  return impl.replace('0x000000000000000000000000', '0x')
}
