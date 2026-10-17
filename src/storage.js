const DB = 'veil-private-demo-v1';
import { validateEnvelope } from './crypto.js';
const STORE = 'local';
let database;
async function db() {
  return database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Private browser storage is unavailable.'));
  });
}
export async function read(key) {
  const store = (await db()).transaction(STORE, 'readonly').objectStore(STORE);
  return new Promise((resolve, reject) => { const req = store.get(key); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
}
export async function write(key, value) {
  const transaction = (await db()).transaction(STORE, 'readwrite');
  transaction.objectStore(STORE).put(value, key);
  return new Promise((resolve, reject) => { transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error); });
}
export async function remove(key) {
  const transaction = (await db()).transaction(STORE, 'readwrite');
  transaction.objectStore(STORE).delete(key);
  return new Promise((resolve, reject) => { transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error); });
}
export async function queue(entry) {
  // This contract rejects plaintext and signer keys before anything reaches storage.
  if (!entry.envelope || entry.envelope.context?.type !== 'veil:v1:signal' || entry.detail || entry.position || entry.privateKey) throw new Error('Only signal ciphertext may enter the outbox.');
  validateEnvelope(entry.envelope, entry.envelope.context);
  if (![6, 24, 48].includes(entry.hours)) throw new Error('Invalid outbox lease.');
  const entries = await read('outbox') ?? [];
  if (entries.length >= 20) throw new Error('Outbox is full. Remove an entry first.');
  await write('outbox', [...entries, { id: crypto.randomUUID(), envelope: entry.envelope, hours: entry.hours, queuedAt: Date.now() }]);
}
