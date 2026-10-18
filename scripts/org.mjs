// Responder-organization actions from the CLI, signed by RESPONDER_PRIVATE_KEY (env only; never printed).
//   node --env-file=.env scripts/org.mjs publish-key '<public JWK json>'
//   node --env-file=.env scripts/org.mjs ack <signalEntityKey>
import { createWalletClient, createPublicClient, ExpirationTime } from '@arkiv-network/sdk';
import { tiramisu } from '@arkiv-network/sdk/chains';
import { str, u64, key } from '@arkiv-network/sdk/attr';
import { privateKeyToAccount } from 'viem/accounts';
import { http } from 'viem';
import { readFile, writeFile } from 'node:fs/promises';
import { fingerprint } from '../src/crypto.js';
import { TYPES, ZONE } from '../src/domain.js';
import { CONFIG } from '../src/config.js';
const [, , command, arg] = process.argv;
if (!/^0x[0-9a-f]{64}$/i.test(process.env.RESPONDER_PRIVATE_KEY ?? '')) { console.error('Set RESPONDER_PRIVATE_KEY in the environment.'); process.exit(1); }
const transport = () => http(CONFIG.http, { retryCount: 0, timeout: 30000 });
const wallet = createWalletClient({ chain: tiramisu, transport: transport(), account: privateKeyToAccount(process.env.RESPONDER_PRIVATE_KEY) });
const client = createPublicClient({ chain: tiramisu, transport: transport() });
if (!CONFIG.responderOrgs.some(a => a.toLowerCase() === wallet.account.address.toLowerCase())) { console.error('This wallet is not an allow-listed responder organization.'); process.exit(1); }
const flags = { readonly: true, permissionlessExtension: false };
const records = JSON.parse(await readFile('arkiv/transactions.json', 'utf8').catch(() => '[]'));
async function record(kind, result) {
  records.push({ kind, chainId: 7738577, creator: wallet.account.address, entityKey: result.entityKey, txHash: result.txHash, expiresAt: result.expiresAt?.toString(), transactionUrl: `${CONFIG.explorer}/tx/${result.txHash}`, recordedAt: new Date().toISOString(), source: 'browser-flow' });
  await writeFile('arkiv/transactions.json', JSON.stringify(records, null, 2) + '\n');
  console.log(kind, result.txHash, 'entity', result.entityKey);
}
if (command === 'publish-key') {
  const jwk = JSON.parse(arg), pubkeyId = await fingerprint(jwk);
  if (jwk.d) throw new Error('Refusing: this JWK contains a private component.');
  const result = await wallet.createEntity({ attributes: { type: str(TYPES.responder), zone: str(ZONE), pubkey_id: str(pubkeyId) }, payload: new TextEncoder().encode(JSON.stringify({ version: 1, publicKey: jwk })), contentType: 'application/json', flags, expires: ExpirationTime.fromDays(30) });
  console.log('pubkeyId', pubkeyId); await record('responder_key_browser', result);
} else if (command === 'ack') {
  if (!/^0x[0-9a-f]{64}$/i.test(arg ?? '')) throw new Error('Pass the signal entity key.');
  const signal = await client.getEntity(arg);
  const result = await wallet.createEntity({ attributes: { type: str(TYPES.ack), signal_key: key(arg), acked_at: u64(Date.now()) }, payload: new Uint8Array(), contentType: 'application/octet-stream', flags, expires: ExpirationTime.atBlock(signal.expiresAt + 21600n) });
  await record('ack_browser_signal', result);
} else { console.error('Usage: publish-key <jwk> | ack <signalKey>'); process.exit(1); }
