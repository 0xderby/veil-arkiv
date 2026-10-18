// Prints public addresses and test-GLM balances only. Reads private keys from env to derive addresses; never prints them.
import { createPublicClient } from '@arkiv-network/sdk';
import { tiramisu } from '@arkiv-network/sdk/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { http, formatEther } from 'viem';
import { CONFIG } from '../src/config.js';
const headers = process.env.ARKIV_ACCESS_KEY ? { 'X-API-KEY': process.env.ARKIV_ACCESS_KEY } : undefined;
const client = createPublicClient({ chain: tiramisu, transport: http(CONFIG.http, { retryCount: 0, timeout: 20000, fetchOptions: headers && { headers } }) });
console.log('chain id', await client.getChainId());
for (const name of ['REPORTER_PRIVATE_KEY', 'RESPONDER_PRIVATE_KEY']) {
  const address = privateKeyToAccount(process.env[name]).address;
  console.log(name.split('_')[0].toLowerCase().padEnd(10), address, formatEther(await client.getBalance({ address })), 'GLM');
}
