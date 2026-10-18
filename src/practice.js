import { encryptSignal, generateResponderKey } from './crypto.js';
import { TYPES, ZONE, FIXTURES, leaseTarget } from './domain.js';
const hex = size => '0x' + [...crypto.getRandomValues(new Uint8Array(size))].map(b => b.toString(16).padStart(2, '0')).join('');
export class PracticeBoard {
  constructor(onChange) {
    this.onChange = onChange; this.signals = new Map(); this.acks = new Map(); this.evidence = []; this.origin = Date.now(); this.initialHead = 100000n; this.reporter = hex(20); this.org = hex(20); this.practice = true;
  }
  get head() { return this.initialHead + BigInt(Math.floor((Date.now() - this.origin) / 2000)); }
  address() { return this.reporter; }
  async start() {
    this.responder = await generateResponderKey();
    this.responders = [{ ...this.responder, privateKey: undefined, keyEntity: hex(32), creator: this.org, expiresAt: this.head + 1296000n }];
    for (const [index, fixture] of FIXTURES.entries()) {
      const context = { type: TYPES.signal, zone: ZONE, need: fixture.need, priority: fixture.priority, postedAt: String(Date.now() - (index + 1) * 780000) };
      await this.submit(await encryptSignal({ synthetic: true, position: fixture.position, details: fixture.detail }, context, this.responders), index === 2 ? 6 : 48, false);
    }
    await this.ack([...this.signals.keys()][0], false);
    this.onChange();
  }
  async submit(envelope, hours, notify = true) {
    const c = envelope.context;
    const entity = { key: hex(32), owner: this.reporter, creator: this.reporter, createdAt: this.head, expiresAt: this.head + BigInt(hours * 1800), creationFlags: { readonly: true, permissionlessExtension: false }, contentType: 'application/json', attributes: { type: { type: 'str', value: TYPES.signal }, zone: { type: 'str', value: c.zone }, need: { type: 'str', value: c.need }, priority: { type: 'i32', value: c.priority }, posted_at: { type: 'u64', value: BigInt(c.postedAt) } }, toJson: () => structuredClone(envelope) };
    this.signals.set(entity.key, entity); if (notify) this.onChange(); return { entityKey: entity.key };
  }
  async ack(signalKey, notify = true) {
    const entity = this.signals.get(signalKey);
    if (!entity) throw new Error('Signal no longer exists.');
    const ack = { key: hex(32), creator: this.org, owner: this.org, expiresAt: entity.expiresAt + 21600n, contentType: 'application/octet-stream', payload: new Uint8Array(), creationFlags: { readonly: true, permissionlessExtension: false }, attributes: { type: { type: 'str', value: TYPES.ack }, signal_key: { type: 'key', value: signalKey }, acked_at: { type: 'u64', value: BigInt(Date.now()) } } };
    this.acks.set(ack.key, ack); if (notify) this.onChange(); return { entityKey: ack.key };
  }
  async renew(entityKey, hours) { const e = this.signals.get(entityKey); e.expiresAt = leaseTarget(this.head, e.expiresAt, hours); this.onChange(); return { entityKey }; }
  async safe(entityKey) { this.signals.delete(entityKey); this.onChange(); return { entityKey }; }
  async refresh() { for (const [k, e] of this.signals) if (e.expiresAt <= this.head) this.signals.delete(k); this.onChange(); }
  stop() { /* No timer, socket, or chain writes in the local walkthrough. */ }
}
