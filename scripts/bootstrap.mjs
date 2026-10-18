// Real synthetic-only testnet acceptance flow. Secrets come from environment variables only.
// Do not run with an unfunded or non-demo wallet. Never prints environment values or private keys.
import { createWalletClient, createPublicClient, ExpirationTime } from '@arkiv-network/sdk';
import { tiramisu } from '@arkiv-network/sdk/chains';
import { eq } from '@arkiv-network/sdk/query';
import { str, i32, u64, key } from '@arkiv-network/sdk/attr';
import { privateKeyToAccount } from 'viem/accounts';
import { http } from 'viem';
import { readFile, writeFile } from 'node:fs/promises';
import { generateResponderKey, encryptSignal, decryptSignal } from '../src/crypto.js';
import { FIXTURES, TYPES, ZONE, contextOf, validateSignal } from '../src/domain.js';
import { CONFIG } from '../src/config.js';
const required = ['REPORTER_PRIVATE_KEY', 'RESPONDER_PRIVATE_KEY'];
if (required.some(name => !/^0x[0-9a-f]{64}$/i.test(process.env[name] ?? ''))) {
  console.error('Not run: set REPORTER_PRIVATE_KEY and RESPONDER_PRIVATE_KEY as environment variables for funded, throwaway Tiramisu wallets. Optional ARKIV_ACCESS_KEY raises query quota. Do not paste secrets into chat.'); process.exit(1);
}
const transport = () => http(CONFIG.http, { retryCount: 0, timeout: 20000, fetchOptions: process.env.ARKIV_ACCESS_KEY ? { headers: { 'X-API-KEY': process.env.ARKIV_ACCESS_KEY } } : undefined });
const reporter = createWalletClient({ chain: tiramisu, transport: transport(), account: privateKeyToAccount(process.env.REPORTER_PRIVATE_KEY) });
const responder = createWalletClient({ chain: tiramisu, transport: transport(), account: privateKeyToAccount(process.env.RESPONDER_PRIVATE_KEY) });
const client = createPublicClient({ chain: tiramisu, transport: transport() });
const records = JSON.parse(await readFile('arkiv/transactions.json', 'utf8').catch(() => '[]'));
const flags = { readonly: true, permissionlessExtension: false }, encode = json => new TextEncoder().encode(JSON.stringify(json));
async function record(kind, wallet, result) {
  records.push({ kind, chainId: 7738577, creator: wallet.account.address, entityKey: result.entityKey, txHash: result.txHash, expiresAt: result.expiresAt?.toString(), transactionUrl: `${CONFIG.explorer}/tx/${result.txHash}`, recordedAt: new Date().toISOString() });
  await writeFile('arkiv/transactions.json', JSON.stringify(records, null, 2) + '\n');
  console.log(`${kind}: ${result.txHash}`);
}
try {
  if (await client.getChainId() !== 7738577) throw new Error('Wrong network.');
  if (!CONFIG.responderOrgs.some(a => a.toLowerCase() === responder.account.address.toLowerCase())) {
    console.error('Not run: the responder public address is not allow-listed. Run configure-responders with this PUBLIC address:', responder.account.address); process.exit(1);
  }
  // Prove reads work before spending even test GLM.
  await client.select({ key: true }).where(eq('type', str(TYPES.signal)), eq('zone', str(ZONE))).limit(1).fetch();
  for (const wallet of [reporter, responder]) if (await client.getBalance({ address: wallet.account.address }) === 0n) throw new Error('Fund both throwaway wallets with test GLM first.');
  const responderKey = await generateResponderKey();
  const published = await responder.createEntity({ attributes: { type: str(TYPES.responder), zone: str(ZONE), pubkey_id: str(responderKey.pubkeyId) }, payload: encode({ version: 1, publicKey: responderKey.jwk }), contentType: 'application/json', flags, expires: ExpirationTime.fromDays(30) });
  await record('responder_key', responder, published);
  const fixture = FIXTURES[0], context = { type: TYPES.signal, zone: ZONE, need: fixture.need, priority: fixture.priority, postedAt: String(Date.now()) };
  const envelope = await encryptSignal({ synthetic: true, details: fixture.detail, position: fixture.position }, context, [{ jwk: responderKey.jwk, pubkeyId: responderKey.pubkeyId, keyEntity: published.entityKey }]);
  const created = await reporter.createEntity({ attributes: { type: str(TYPES.signal), zone: str(ZONE), need: str(context.need), priority: i32(context.priority), posted_at: u64(context.postedAt) }, payload: encode(envelope), contentType: 'application/json', flags, expires: ExpirationTime.fromHours(6) });
  await record('signal', reporter, created);
  const entity = validateSignal(await client.getEntity(created.entityKey), await client.getBlockNumber({ cacheTime: 0 }));
  const plaintext = await decryptSignal(entity.toJson(), contextOf(entity), responderKey);
  if (plaintext.details !== fixture.detail) throw new Error('Round trip decryption mismatch.');
  const acked = await responder.createEntity({ attributes: { type: str(TYPES.ack), signal_key: key(created.entityKey), acked_at: u64(Date.now()) }, payload: new Uint8Array(), contentType: 'application/octet-stream', flags, expires: ExpirationTime.atBlock(entity.expiresAt + 21600n) });
  await record('ack', responder, acked);
  const renewed = await reporter.extendEntity({ entityKey: created.entityKey, expires: ExpirationTime.fromHours(48) });
  await record('extension', reporter, renewed);
  const settled = await client.getEntity(created.entityKey);
  const reconfirmed = await responder.createEntity({ attributes: { type: str(TYPES.ack), signal_key: key(created.entityKey), acked_at: u64(Date.now()) }, payload: new Uint8Array(), contentType: 'application/octet-stream', flags, expires: ExpirationTime.atBlock(settled.expiresAt + 21600n) });
  await record('ack_renewed_lease', responder, reconfirmed);
  const matches = await client.select().where(eq('type', str(TYPES.signal)), eq('zone', str(ZONE))).createdBy(reporter.account.address).limit(200).fetch();
  if (!matches.entities.some(e => e.key === created.entityKey)) throw new Error('Created signal missing from query.');
  console.log('PASS: encrypted create/read/decrypt, authenticated ack, renewal, and query. Public transaction evidence saved to arkiv/transactions.json. Private ECDH key was in process memory only and is not exported; the browser cannot decrypt this CLI fixture later.');
} catch (error) {
  console.error('Acceptance flow stopped:', error.shortMessage ?? (error.message?.includes('http') ? 'Network request failed; inspect quota/connectivity without logging secrets.' : error.message));
  console.error('Successful writes, if any, are already recorded in arkiv/transactions.json. Do not retry blindly after a partial run.'); process.exitCode = 1;
}
