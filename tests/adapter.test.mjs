import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ArkivBoard } from '../src/arkiv.js';
test('unrelated chain entities do not rerender the board', async () => {
  let renders = 0;
  const board = new ArkivBoard(() => renders++, () => {});
  board.client = { getEntity: async () => ({ key: 'unrelated', attributes: { type: { type: 'str', value: 'another-project' } } }) };
  await board.hydrate('unrelated'); assert.equal(renders, 0);
});
test('head updates without expiration do not rerender interactive controls', () => {
  let renders = 0;
  const board = new ArkivBoard(() => renders++, () => {});
  board.expire(); assert.equal(renders, 0);
  board.signals.set('expired', { expiresAt: 0n }); board.expire();
  assert.equal(renders, 1); assert.equal(board.signals.size, 0);
});
test('quota exhaustion blocks queued event hydration until explicit retry', () => {
  const board = new ArkivBoard(() => {}, () => {});
  board.pendingKeys.add('pending'); board.quotaBlocked = true;
  board.hydrate = () => { throw new Error('Must not request RPC while quota-blocked.'); };
  board.drain(); assert.equal(board.activeHydrations, 0);
});
