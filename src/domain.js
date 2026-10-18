import { fingerprint, publicJwk, validateEnvelope } from './crypto.js';
export const ZONE = 's000';
export const TYPES = { signal: 'veil:v1:signal', responder: 'veil:v1:responder_key', ack: 'veil:v1:ack' };
export const NEEDS = ['medical', 'water', 'road', 'shelter'];
export const FIXTURES = [
  { id: 'water', need: 'water', priority: 2, title: 'Drinking water', detail: 'SYNTHETIC: Two water containers requested at the fictional east assembly point.', position: { grid: 'Glass Isle fictional grid', x: 124, y: 87 } },
  { id: 'medical', need: 'medical', priority: 3, title: 'Medical supplies', detail: 'SYNTHETIC: A fictional first-aid station needs replacement supply kits. No real patient.', position: { grid: 'Glass Isle fictional grid', x: 210, y: 143 } },
  { id: 'road', need: 'road', priority: 2, title: 'Blocked passage', detail: 'SYNTHETIC: An invented fallen barrier blocks the north service path.', position: { grid: 'Glass Isle fictional grid', x: 74, y: 192 } },
  { id: 'shelter', need: 'shelter', priority: 1, title: 'Temporary shelter', detail: 'SYNTHETIC: Tent materials requested for a fictional gathering area.', position: { grid: 'Glass Isle fictional grid', x: 179, y: 46 } },
];
export const sameAddress = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
export const allowed = (address, allowlist) => allowlist.some(a => sameAddress(a, address));
export const value = (entity, name, type) => entity.attributes?.[name]?.type === type ? entity.attributes[name].value : undefined;
export const immutable = e => e.creationFlags?.readonly === true && e.creationFlags?.permissionlessExtension === false;
const identity = e => /^0x[a-f0-9]{64}$/i.test(e.key ?? '') && /^0x[a-f0-9]{40}$/i.test(e.creator ?? '') && /^0x[a-f0-9]{40}$/i.test(e.owner ?? '') && typeof e.expiresAt === 'bigint';
function exactAttributes(e, names) { return Object.keys(e.attributes ?? {}).sort().join(',') === [...names].sort().join(','); }
export function contextOf(e) {
  return { type: TYPES.signal, zone: value(e, 'zone', 'str'), need: value(e, 'need', 'str'), priority: value(e, 'priority', 'i32'), postedAt: String(value(e, 'posted_at', 'u64')) };
}
export function validateSignal(e, head) {
  if (!identity(e) || e.contentType !== 'application/json') throw new Error('Invalid signal schema or entity metadata.');
  if (value(e, 'type', 'str') !== TYPES.signal || value(e, 'zone', 'str') !== ZONE || !NEEDS.includes(value(e, 'need', 'str')) || ![1, 2, 3].includes(value(e, 'priority', 'i32')) || typeof value(e, 'posted_at', 'u64') !== 'bigint' || !immutable(e) || e.expiresAt <= head || !exactAttributes(e, ['type', 'zone', 'need', 'priority', 'posted_at'])) throw new Error('Invalid signal schema, flags, or expiration.');
  const postedAt = value(e, 'posted_at', 'u64');
  if (postedAt > BigInt(Number.MAX_SAFE_INTEGER) || postedAt < 1n) throw new Error('Invalid timestamp.');
  validateEnvelope(e.toJson(), contextOf(e));
  return e;
}
export async function validateResponder(e, head, allowlist) {
  if (!identity(e) || e.contentType !== 'application/json') throw new Error('Invalid responder entity metadata.');
  if (value(e, 'type', 'str') !== TYPES.responder || value(e, 'zone', 'str') !== ZONE || !allowed(e.creator, allowlist) || !immutable(e) || e.expiresAt <= head || !exactAttributes(e, ['type', 'zone', 'pubkey_id'])) throw new Error('Untrusted or expired responder key.');
  const payload = e.toJson();
  if (payload.version !== 1) throw new Error('Unknown responder-key version.');
  const jwk = publicJwk(payload.publicKey);
  const pubkeyId = await fingerprint(jwk);
  if (pubkeyId !== value(e, 'pubkey_id', 'str')) throw new Error('Public-key fingerprint mismatch.');
  return { keyEntity: e.key, jwk, pubkeyId, creator: e.creator, expiresAt: e.expiresAt };
}
export function trustedAck(e, signal, head, allowlist) {
  if (!identity(e) || e.contentType !== 'application/octet-stream' || !(e.payload instanceof Uint8Array) || e.payload.length !== 0) return false;
  return value(e, 'type', 'str') === TYPES.ack && value(e, 'signal_key', 'key') === signal.key && typeof value(e, 'acked_at', 'u64') === 'bigint' && value(e, 'acked_at', 'u64') > 0n && value(e, 'acked_at', 'u64') <= BigInt(Number.MAX_SAFE_INTEGER) && allowed(e.creator, allowlist) && immutable(e) && e.expiresAt > head && exactAttributes(e, ['type', 'signal_key', 'acked_at']);
}
export function sortSignals(signals) {
  return [...signals].sort((a, b) => value(b, 'priority', 'i32') - value(a, 'priority', 'i32') || Number(value(b, 'posted_at', 'u64') - value(a, 'posted_at', 'u64')) || a.key.localeCompare(b.key));
}
export function leaseTarget(head, currentExpiry, hours) {
  if (![6, 24, 48].includes(Number(hours))) throw new Error('Choose a 6, 24, or 48 hour lease.');
  const target = head + BigInt(Number(hours) * 1800);
  if (target <= currentExpiry) throw new Error('Choose a longer lease or renew closer to expiration. Lifetime Extension must move expiry later.');
  return target;
}
