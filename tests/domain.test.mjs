import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PracticeBoard } from '../src/practice.js';
import { trustedAck, validateSignal, validateResponder, leaseTarget, sortSignals, value, TYPES } from '../src/domain.js';
const board = new PracticeBoard(() => {}); await board.start();
const signal = [...board.signals.values()][0], ack = [...board.acks.values()][0];
test('practice examples contain valid encrypted signal schemas', () => {
  for (const entity of board.signals.values()) assert.equal(validateSignal(entity, board.head), entity);
  assert.equal(board.evidence.length, 0);
});
test('creator authenticates ack; copying fields and owner does not', () => {
  assert.ok(trustedAck(ack, signal, board.head, [board.org]));
  assert.ok(!trustedAck({ ...ack, creator: board.reporter, owner: board.org }, signal, board.head, [board.org]));
  assert.ok(!trustedAck({ ...ack, expiresAt: board.head }, signal, board.head, [board.org]));
  assert.ok(!trustedAck({ ...ack, creationFlags: { readonly: false } }, signal, board.head, [board.org]));
  assert.ok(!trustedAck({ ...ack, payload: new TextEncoder().encode('unwanted payload') }, signal, board.head, [board.org]));
});
test('responder key creator is enforced even when owner is trusted', async () => {
  const r = board.responders[0];
  const entity = { key: r.keyEntity, creator: board.org, owner: board.org, expiresAt: r.expiresAt, contentType: 'application/json', creationFlags: { readonly: true, permissionlessExtension: false }, attributes: { type: { type: 'str', value: TYPES.responder }, zone: { type: 'str', value: 's000' }, pubkeyId: { type: 'str', value: r.pubkeyId } }, toJson: () => ({ version: 1, publicKey: r.jwk }) };
  assert.equal((await validateResponder(entity, board.head, [board.org])).pubkeyId, r.pubkeyId);
  await assert.rejects(validateResponder({ ...entity, creator: board.reporter }, board.head, [board.org]), /Untrusted/);
});
test('unexpected public attributes are rejected', () => {
  assert.throws(() => validateSignal({ ...signal, attributes: { ...signal.attributes, details: { type: 'str', value: 'SYNTHETIC' } } }, board.head), /schema/);
});
test('expiration and patchable signals are rejected', () => {
  assert.throws(() => validateSignal({ ...signal, expiresAt: board.head }, board.head));
  assert.throws(() => validateSignal({ ...signal, creationFlags: { readonly: false, permissionlessExtension: false } }, board.head));
});
test('lease renewal rejects equal or earlier expiry and invalid hours', () => {
  assert.throws(() => leaseTarget(100n, 86500n, 48), /later/);
  assert.throws(() => leaseTarget(100n, 86500n, 6), /later/);
  assert.throws(() => leaseTarget(100n, 0n, 100), /Choose/);
  assert.equal(leaseTarget(200n, 86500n, 48), 86600n);
});
test('all signals sort by priority before asserted posting time', () => {
  const sorted = sortSignals([...board.signals.values()]);
  assert.equal(value(sorted[0], 'need', 'str'), 'medical');
  assert.equal(value(sorted.at(-1), 'need', 'str'), 'shelter');
});
test('local lifecycle renews the lease and removes the live signal', async () => {
  const shortLease = [...board.signals.values()].find(e => value(e, 'need', 'str') === 'road');
  const old = shortLease.expiresAt; await board.renew(shortLease.key, 24); assert.ok(shortLease.expiresAt > old);
  await board.safe(shortLease.key); assert.ok(!board.signals.has(shortLease.key)); assert.equal(board.evidence.length, 0);
});
