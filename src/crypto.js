const encoder = new TextEncoder();
const decoder = new TextDecoder();
const subtle = globalThis.crypto.subtle;
export const ALGORITHM = 'ECDH-P256-HKDF-SHA256+A256GCM';
export const bytes = value => encoder.encode(value);
const exactFields = (object, fields) => object && Object.keys(object).sort().join(',') === [...fields].sort().join(',');
export const canonical = value => JSON.stringify(value && typeof value === 'object' && !Array.isArray(value)
  ? Object.fromEntries(Object.keys(value).sort().map(k => [k, JSON.parse(canonical(value[k]))]))
  : Array.isArray(value) ? value.map(v => JSON.parse(canonical(v))) : value);
export function base64(data) { return btoa(String.fromCharCode(...new Uint8Array(data))); }
export function unbase64(value) {
  if (typeof value !== 'string' || value.length > 131072 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error('Invalid envelope encoding.');
  return Uint8Array.from(atob(value), c => c.charCodeAt(0));
}
const random = n => crypto.getRandomValues(new Uint8Array(n));
export function publicJwk(jwk) {
  if (!jwk || jwk.kty !== 'EC' || jwk.crv !== 'P-256' || jwk.d || !/^[\w-]{43}$/.test(jwk.x ?? '') || !/^[\w-]{43}$/.test(jwk.y ?? '')) throw new Error('Expected a public P-256 key without private material.');
  return { crv: 'P-256', kty: 'EC', x: jwk.x, y: jwk.y };
}
export async function fingerprint(jwk) {
  return [...new Uint8Array(await subtle.digest('SHA-256', bytes(canonical(publicJwk(jwk)))))].map(b => b.toString(16).padStart(2, '0')).join('');
}
export async function generateResponderKey() {
  const pair = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  const jwk = publicJwk(await subtle.exportKey('jwk', pair.publicKey));
  return { privateKey: pair.privateKey, jwk, pubkeyId: await fingerprint(jwk) };
}
async function wrappingKey(privateKey, jwk, salt, info, usages) {
  const pub = await subtle.importKey('jwk', publicJwk(jwk), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: pub }, privateKey, 256));
  try {
    const hkdf = await subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
    return await subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: bytes(info) }, hkdf, { name: 'AES-GCM', length: 256 }, false, usages);
  } finally { shared.fill(0); }
}
export function validateEnvelope(e, context) {
  if (!exactFields(e, ['version', 'algorithm', 'context', 'ephemeralPublicKey', 'iv', 'recipients', 'ciphertext']) || !exactFields(e.context, ['type', 'zone', 'need', 'priority', 'postedAt'])) throw new Error('Unexpected envelope fields are not allowed.');
  if (!e || e.version !== 1 || e.algorithm !== ALGORITHM || canonical(e.context) !== canonical(context)) throw new Error('Envelope context does not match public attributes.');
  if (context.type !== 'veil:v1:signal' || !/^[0123456789bcdefghjkmnpqrstuvwxyz]{4}$/.test(context.zone) || !['medical', 'water', 'road', 'shelter'].includes(context.need) || ![1, 2, 3].includes(context.priority) || !/^[1-9][0-9]{0,15}$/.test(context.postedAt) || BigInt(context.postedAt) > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Invalid public signal context.');
  if (!exactFields(e.ephemeralPublicKey, ['crv', 'kty', 'x', 'y'])) throw new Error('Unexpected public-key fields are not allowed.');
  publicJwk(e.ephemeralPublicKey);
  if (!Array.isArray(e.recipients) || !e.recipients.length || e.recipients.length > 16) throw new Error('Invalid envelope recipients.');
  const seen = new Set();
  for (const r of e.recipients) {
    if (!exactFields(r, ['pubkeyId', 'keyEntity', 'salt', 'iv', 'wrappedKey'])) throw new Error('Unexpected wrapper fields are not allowed.');
    if (!/^[a-f0-9]{64}$/.test(r.pubkeyId) || !/^0x[a-f0-9]{64}$/i.test(r.keyEntity) || seen.has(r.pubkeyId)) throw new Error('Invalid or duplicate recipient.');
    seen.add(r.pubkeyId);
    if (unbase64(r.salt).length !== 32 || unbase64(r.iv).length !== 12 || unbase64(r.wrappedKey).length !== 48) throw new Error('Invalid key wrapper.');
  }
  if (unbase64(e.iv).length !== 12 || unbase64(e.ciphertext).length < 16) throw new Error('Invalid ciphertext.');
  return e;
}
const header = e => ({ version: e.version, algorithm: e.algorithm, context: e.context, ephemeralPublicKey: e.ephemeralPublicKey, recipients: e.recipients.map(r => ({ pubkeyId: r.pubkeyId, keyEntity: r.keyEntity })) });
const wrapperInfo = (h, r) => canonical({ domain: 'veil:v1:wrap', header: h, pubkeyId: r.pubkeyId, keyEntity: r.keyEntity });
export async function encryptSignal(cleartext, context, recipients) {
  if (!recipients.length || recipients.length > 16) throw new Error('No trusted responders available, or too many recipients.');
  if (new Set(recipients.map(r => r.pubkeyId)).size !== recipients.length) throw new Error('Duplicate recipient key.');
  for (const r of recipients) if (await fingerprint(r.jwk) !== r.pubkeyId) throw new Error('Responder fingerprint mismatch.');
  const ephemeral = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  const dataKey = random(32);
  const e = { version: 1, algorithm: ALGORITHM, context, ephemeralPublicKey: publicJwk(await subtle.exportKey('jwk', ephemeral.publicKey)), iv: base64(random(12)), recipients: recipients.map(r => ({ pubkeyId: r.pubkeyId, keyEntity: r.keyEntity })) };
  const h = header(e);
  try {
    for (let i = 0; i < recipients.length; i++) {
      const r = e.recipients[i], salt = random(32), iv = random(12), info = wrapperInfo(h, r);
      const key = await wrappingKey(ephemeral.privateKey, recipients[i].jwk, salt, info, ['encrypt']);
      Object.assign(r, { salt: base64(salt), iv: base64(iv), wrappedKey: base64(await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: bytes(info) }, key, dataKey)) });
    }
    const aes = await subtle.importKey('raw', dataKey, 'AES-GCM', false, ['encrypt']);
    e.ciphertext = base64(await subtle.encrypt({ name: 'AES-GCM', iv: unbase64(e.iv), additionalData: bytes(canonical(h)) }, aes, bytes(canonical(cleartext))));
    return validateEnvelope(e, context);
  } finally { dataKey.fill(0); }
}
export async function decryptSignal(envelope, context, responder) {
  const e = validateEnvelope(envelope, context);
  const r = e.recipients.find(r => r.pubkeyId === responder.pubkeyId);
  if (!r) throw new Error('This responder is not a recipient of this signal.');
  const h = header(e), info = wrapperInfo(h, r);
  const wrapKey = await wrappingKey(responder.privateKey, e.ephemeralPublicKey, unbase64(r.salt), info, ['decrypt']);
  const raw = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: unbase64(r.iv), additionalData: bytes(info) }, wrapKey, unbase64(r.wrappedKey)));
  try {
    const aes = await subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
    const plaintext = await subtle.decrypt({ name: 'AES-GCM', iv: unbase64(e.iv), additionalData: bytes(canonical(h)) }, aes, unbase64(e.ciphertext));
    return JSON.parse(decoder.decode(plaintext));
  } finally { raw.fill(0); }
}
