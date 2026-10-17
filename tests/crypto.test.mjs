import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encryptSignal, decryptSignal, generateResponderKey, base64, unbase64, validateEnvelope } from '../src/crypto.js';
const context = { type: 'veil:v1:signal', zone: 's000', need: 'water', priority: 2, postedAt: '1792195200000' };
const clear = { synthetic: true, details: 'SYNTHETIC WATER MARKER', position: { grid: 'Fictional', x: 4, y: 8 } };
const alice = await generateResponderKey(), bob = await generateResponderKey(), outsider = await generateResponderKey();
const recipients = [alice, bob].map((r, i) => ({ ...r, keyEntity: `0x${String(i + 1).repeat(64)}` }));
const encrypted = await encryptSignal(clear, context, recipients);
test('each authorized recipient decrypts its separately wrapped AES key', async () => {
  assert.deepEqual(await decryptSignal(encrypted, context, alice), clear);
  assert.deepEqual(await decryptSignal(encrypted, context, bob), clear);
  assert.notEqual(encrypted.recipients[0].wrappedKey, encrypted.recipients[1].wrappedKey);
});
test('private ECDH key cannot be exported', async () => {
  assert.equal(alice.privateKey.extractable, false);
  await assert.rejects(crypto.subtle.exportKey('jwk', alice.privateKey));
});
test('plaintext and private key fields never appear in the envelope', () => {
  const serialized = JSON.stringify(encrypted);
  assert.ok(!serialized.includes(clear.details));
  assert.ok(!serialized.includes('privateKey'));
  assert.ok(!serialized.includes('"position"'));
  assert.equal(encrypted.ephemeralPublicKey.d, undefined);
});
test('unlisted key cannot decrypt', async () => { await assert.rejects(decryptSignal(encrypted, context, outsider), /not a recipient/); });
test('wrong private key with spoofed recipient ID cannot decrypt', async () => {
  await assert.rejects(decryptSignal(encrypted, context, { ...outsider, pubkeyId: alice.pubkeyId }));
});
test('modified ciphertext fails GCM authentication', async () => {
  const forged = structuredClone(encrypted), ciphertext = unbase64(forged.ciphertext); ciphertext[0] ^= 1; forged.ciphertext = base64(ciphertext);
  await assert.rejects(decryptSignal(forged, context, alice));
});
test('public metadata cannot be changed alongside an existing envelope', async () => {
  const forged = structuredClone(encrypted), changed = { ...context, priority: 3 }; forged.context = changed;
  await assert.rejects(decryptSignal(forged, changed, alice));
  await assert.rejects(decryptSignal(encrypted, changed, alice), /context/);
});
test('tampering with recipients or wrapped key fails authentication', async () => {
  const changed = structuredClone(encrypted); changed.recipients[0].keyEntity = `0x${'a'.repeat(64)}`;
  await assert.rejects(decryptSignal(changed, context, bob));
  const wrapper = structuredClone(encrypted), raw = unbase64(wrapper.recipients[0].wrappedKey); raw[0] ^= 1; wrapper.recipients[0].wrappedKey = base64(raw);
  await assert.rejects(decryptSignal(wrapper, context, alice));
});
test('missing responders and duplicate recipients fail closed', async () => {
  await assert.rejects(encryptSignal(clear, context, []), /No trusted/);
  await assert.rejects(encryptSignal(clear, context, [recipients[0], recipients[0]]), /Duplicate/);
});
test('a fresh signal gets different ephemeral key, nonce, and ciphertext', async () => {
  const next = await encryptSignal(clear, context, recipients);
  assert.notDeepEqual(next.ephemeralPublicKey, encrypted.ephemeralPublicKey);
  assert.notEqual(next.iv, encrypted.iv); assert.notEqual(next.ciphertext, encrypted.ciphertext);
});
test('malformed envelope and private JWK material are rejected', () => {
  const forged = structuredClone(encrypted); forged.ephemeralPublicKey.d = 'not allowed';
  assert.throws(() => validateEnvelope(forged, context), /public-key/);
  assert.throws(() => validateEnvelope({ ...encrypted, iv: '!' }, context), /encoding/);
});
