import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateResponderKey, encryptSignal, decryptSignal } from '../src/crypto.js';
import { queue, read, write, remove } from '../src/storage.js';
const responder = await generateResponderKey();
const context = { type: 'veil:v1:signal', zone: 's000', need: 'water', priority: 2, postedAt: '1792195200000' };
const detail = { synthetic: true, details: 'SYNTHETIC OFFLINE PLAINTEXT MARKER', position: { grid: 'Fictional', x: 7, y: 9 } };
const envelope = await encryptSignal(detail, context, [{ ...responder, keyEntity: `0x${'1'.repeat(64)}` }]);
test('outbox persists only a valid envelope and lease, preserving decryption', async () => {
  await write('outbox', []); await queue({ envelope, hours: 24, ignoredField: 'must not be saved' });
  const [entry] = await read('outbox');
  assert.deepEqual(Object.keys(entry).sort(), ['envelope', 'hours', 'id', 'queuedAt']);
  assert.ok(!JSON.stringify(entry).includes(detail.details));
  assert.ok(!JSON.stringify(entry).includes('must not be saved'));
  assert.deepEqual(await decryptSignal(entry.envelope, context, responder), detail);
});
test('non-extractable private CryptoKey survives structured-clone storage', async () => {
  await write('responderKeys', [responder]);
  const [saved] = await read('responderKeys');
  assert.equal(saved.privateKey.extractable, false);
  assert.deepEqual(await decryptSignal(envelope, context, saved), detail);
  await assert.rejects(crypto.subtle.exportKey('jwk', saved.privateKey));
});
test('outbox rejects plaintext, extra envelope fields, and invalid leases', async () => {
  await assert.rejects(queue({ envelope, hours: 24, detail: detail.details }), /ciphertext/);
  await assert.rejects(queue({ envelope: { ...envelope, details: detail.details }, hours: 24 }), /fields/);
  await assert.rejects(queue({ envelope, hours: 2 }), /lease/);
});
test('outbox is bounded and explicit removal succeeds', async () => {
  await write('outbox', Array.from({ length: 20 }, () => ({ envelope, hours: 6 })));
  await assert.rejects(queue({ envelope, hours: 6 }), /full/);
  await remove('outbox'); assert.equal(await read('outbox'), undefined);
});
