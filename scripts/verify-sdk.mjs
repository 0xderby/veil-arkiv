// Schema/API verification only. No UI, accounts, secrets, or transactions.
import assert from 'node:assert/strict';
import { createPublicClient, ExpirationTime, resolveExpiry, encodeCreationFlags } from '@arkiv-network/sdk';
import { tiramisu } from '@arkiv-network/sdk/chains';
import { str, i32, u64, key } from '@arkiv-network/sdk/attr';
import { eq, gte } from '@arkiv-network/sdk/query';
import { http } from 'viem';

const client = createPublicClient({ chain: tiramisu, transport: http(undefined, { timeout: 10000, retryCount: 0 }) });
// Public placeholders used only to render queries, never as trust configuration.
const org = '0x0000000000000000000000000000000000000001';
const signalKey = `0x${'11'.repeat(32)}`;
const zone = 's000';
const signals = () => client.select().where(eq('type', str('veil:v1:signal')), eq('zone', str(zone))).limit(200);
const queries = {
  signals: signals(),
  urgentWater: signals().where(eq('need', str('water')), gte('priority', i32(2))),
  responderKeys: client.select().where(eq('type', str('veil:v1:responder_key')), eq('zone', str(zone))).createdBy(org).limit(200),
  acks: client.select().where(eq('type', str('veil:v1:ack')), eq('signalKey', key(signalKey))).createdBy(org).limit(200),
  mySignals: signals().ownedBy(org),
};
assert.equal(tiramisu.id, 7738577);
assert.equal(u64(1792195200000).value, 1792195200000n);
assert.throws(() => i32(1792195200000));
assert.equal(encodeCreationFlags({ readonly: true, permissionlessExtension: false }), 1);
assert.equal(resolveExpiry(ExpirationTime.fromHours(48), { currentBlock: 100n }).target, 86500n);
assert.equal(resolveExpiry(ExpirationTime.atBlock(100000n), { currentBlock: 100n }).target, 100000n);
assert.equal(typeof queries.signals.orderBy, 'undefined');
assert.equal(typeof queries.signals.cursor, 'function');
assert.equal(typeof client.watchEntityEvents, 'function');
assert.throws(() => client.select().where(gte('$createdAt', u64(1))));
for (const [name, query] of Object.entries(queries)) console.log(`${name}: ${query.toString()}`);
console.log('PASS: offline SDK checks (not on-chain verification).');

if (process.argv.includes('--live-http')) {
  try {
    const chainId = await client.getChainId();
    assert.equal(chainId, 7738577);
    console.log(`Live chain ID verified: ${chainId}`);
    const page = await signals().fetch();
    console.log(JSON.stringify({ chainId, blockNumber: page.blockNumber.toString(), signalCount: page.entities.length, hasNextPage: page.hasNextPage() }));
    console.log('PASS: live HTTP chain ID and namespaced zone query; no writes.');
  } catch (error) {
    console.error('LIVE HTTP NOT VERIFIED:', error.shortMessage ?? error.message);
    let cause = error.cause;
    for (let depth = 0; cause && depth < 4; depth++, cause = cause.cause) {
      console.error(`${cause.name ?? 'Cause'}${cause.code ? ` (${cause.code})` : ''}: ${cause.message}`);
    }
    process.exitCode = 1;
  }
}
