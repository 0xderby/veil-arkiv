// Public addresses only. This file never reads a private key.
import { writeFile } from 'node:fs/promises';
import { isAddress, getAddress } from 'viem';
const addresses = process.argv.slice(2);
if (!addresses.length || addresses.some(a => !isAddress(a) || /^0x0{40}$/i.test(a))) {
  console.error('Usage: node scripts/configure-responders.mjs <public-org-address> [public-org-address...]'); process.exit(1);
}
const responderOrgs = [...new Set(addresses.map(getAddress))];
const config = { http: 'https://rpc.tiramisu.db-chain.testnet.arkiv.network', ws: 'wss://rpc.tiramisu.db-chain.testnet.arkiv.network', explorer: 'https://tiramisu.explorer.arkiv.network', responderOrgs };
await writeFile('src/config.js', '// PUBLIC configuration only. Never add private keys or RPC access secrets.\nexport const CONFIG = ' + JSON.stringify(config, null, 2) + ';\n');
console.log(`Configured ${responderOrgs.length} public responder organization address(es). Rebuild and redeploy.`);
