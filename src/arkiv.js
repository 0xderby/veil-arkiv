import { createPublicClient, createWalletClient, ExpirationTime } from '@arkiv-network/sdk';
import { tiramisu } from '@arkiv-network/sdk/chains';
import { eq, gte } from '@arkiv-network/sdk/query';
import { str, i32, u64, key } from '@arkiv-network/sdk/attr';
import { http, webSocket, formatEther, custom } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { CONFIG } from './config.js';
import { TYPES, ZONE, contextOf, allowed, value, validateSignal, validateResponder, trustedAck, leaseTarget } from './domain.js';
import { validateEnvelope } from './crypto.js';

const flags = { readonly: true, permissionlessExtension: false };
const payload = json => new TextEncoder().encode(JSON.stringify(json));
export class ArkivBoard {
  constructor(onChange, onStatus) {
    this.onChange = onChange; this.onStatus = onStatus; this.signals = new Map(); this.acks = new Map(); this.responders = []; this.head = 0n; this.closed = false; this.busy = false; this.evidence = []; this.cleanup = []; this.pendingKeys = new Set(); this.activeHydrations = 0;
    this.client = createPublicClient({ chain: tiramisu, transport: http(CONFIG.http, { retryCount: 0, timeout: 12000, onFetchResponse: response => {
      if (response.status === 429) this.onStatus('quota', 'Tiramisu query quota reached. An access-key-backed RPC endpoint is required.');
    } }) });
  }
  async pages(builder) {
    let page = await builder.limit(200).fetch();
    const entities = [...page.entities];
    while (page.hasNextPage()) { page = await page.next(); entities.push(...page.entities); }
    return entities;
  }
  signalQuery({ need, priority } = {}) {
    const q = this.client.select().where(eq('type', str(TYPES.signal)), eq('zone', str(ZONE)));
    if (need) q.where(eq('need', str(need)));
    if (priority) q.where(gte('priority', i32(priority)));
    return q;
  }
  async refresh() {
    if (this.busy || this.closed) return;
    this.busy = true;
    try {
      const id = await this.client.getChainId();
      if (id !== 7738577) throw new Error('Wrong chain. Tiramisu 7738577 is required.');
      this.head = await this.client.getBlockNumber({ cacheTime: 0 });
      const found = await this.pages(this.signalQuery());
      const next = new Map();
      for (const e of found) { try { next.set(e.key, validateSignal(e, this.head)); } catch { /* Reject malformed public data. */ } }
      this.signals = next;
      await this.loadResponders();
      const acks = new Map();
      for (const signal of this.signals.values()) {
        for (const org of CONFIG.responderOrgs) {
          const results = await this.pages(this.client.select().where(eq('type', str(TYPES.ack)), eq('signalKey', key(signal.key))).createdBy(org));
          for (const e of results) if (trustedAck(e, signal, this.head, CONFIG.responderOrgs)) acks.set(e.key, e);
        }
      }
      this.acks = acks;
      this.onChange(); this.onStatus('snapshot', 'Tiramisu snapshot loaded.');
    } finally {
      this.busy = false;
      this.drain();
    }
  }
  async loadResponders() {
    const recipients = [];
    for (const org of CONFIG.responderOrgs) {
      const found = await this.pages(this.client.select().where(eq('type', str(TYPES.responder)), eq('zone', str(ZONE))).createdBy(org));
      for (const e of found) { try { recipients.push(await validateResponder(e, this.head, CONFIG.responderOrgs)); } catch { /* Never trust self-reported org fields. */ } }
    }
    this.responders = [...new Map(recipients.map(r => [r.pubkeyId, r])).values()];
  }
  async start() {
    this.closed = false;
    this.ws = createPublicClient({ chain: tiramisu, transport: webSocket(CONFIG.ws, { retryCount: 0, timeout: 12000, reconnect: { attempts: 3, delay: 2000 } }) });
    // Real socket path: no fromBlock and no HTTP fallback.
    this.cleanup.push(this.ws.watchEntityEvents({ onEvent: event => {
      if (this.closed) return;
      this.head = event.blockNumber > this.head ? event.blockNumber : this.head;
      this.onStatus('event', 'Entity event received over WebSocket.');
      this.pendingKeys.add(event.entityKey);
      if (this.pendingKeys.size > 100) { this.pendingKeys.clear(); this.refresh().catch(e => this.onStatus('error', this.error(e))); }
      this.drain();
    }, onError: e => this.onStatus('error', this.error(e)) }));
    this.ws.transport.getSocket().then(socket => {
      if (this.closed) return;
      const opened = () => { this.onStatus('socket', 'Socket open. Zone filtering runs in this browser.'); this.refresh().catch(e => this.onStatus('error', this.error(e))); };
      const closed = () => this.onStatus('disconnected', 'Socket disconnected. Reconcile on reconnect.');
      socket.addEventListener('open', opened); socket.addEventListener('close', closed);
      if (socket.readyState === 1) this.onStatus('socket', 'Socket open; waiting for entity events.');
      this.cleanup.push(() => { socket.removeEventListener('open', opened); socket.removeEventListener('close', closed); });
    }).catch(e => this.onStatus('error', this.error(e)));
    // Block notifications remove expired cards without a query refresh loop.
    this.ws.transport.subscribe({ params: ['newHeads'], onData: data => {
      if (this.closed) return;
      const block = data.result?.number;
      if (block) { this.head = BigInt(block); this.expire(); }
    }, onError: e => this.onStatus('error', this.error(e)) }).then(s => { if (this.closed) s.unsubscribe().catch(() => {}); else this.cleanup.push(() => s.unsubscribe().catch(() => {})); }).catch(e => this.onStatus('error', this.error(e)));
    await this.refresh();
  }
  drain() {
    if (this.closed || this.busy) return;
    while (this.activeHydrations < 2 && this.pendingKeys.size) {
      const entityKey = this.pendingKeys.values().next().value;
      this.pendingKeys.delete(entityKey); this.activeHydrations++;
      this.hydrate(entityKey).catch(e => this.onStatus('error', this.error(e))).finally(() => { this.activeHydrations--; this.drain(); });
    }
  }
  async hydrate(entityKey) {
    let e;
    try { e = await this.client.getEntity(entityKey); }
    catch (error) {
      if (error.name === 'NoEntityFoundError') { this.signals.delete(entityKey); this.acks.delete(entityKey); this.responders = this.responders.filter(r => r.keyEntity !== entityKey); this.onChange(); return; }
      throw error;
    }
    if (this.closed) return;
    const type = value(e, 'type', 'str');
    if (type === TYPES.signal && value(e, 'zone', 'str') === ZONE) {
      try { this.signals.set(e.key, validateSignal(e, this.head)); } catch { this.signals.delete(e.key); }
    } else if (type === TYPES.ack) {
      const signal = this.signals.get(value(e, 'signalKey', 'key'));
      if (signal && trustedAck(e, signal, this.head, CONFIG.responderOrgs)) this.acks.set(e.key, e);
      else this.acks.delete(e.key);
    } else if (type === TYPES.responder && value(e, 'zone', 'str') === ZONE) {
      this.responders = this.responders.filter(r => r.keyEntity !== entityKey);
      try { this.responders.push(await validateResponder(e, this.head, CONFIG.responderOrgs)); } catch { /* Reject forged creator. */ }
    }
    this.onChange();
  }
  expire() {
    for (const [k, e] of this.signals) if (e.expiresAt <= this.head) this.signals.delete(k);
    for (const [k, e] of this.acks) if (e.expiresAt <= this.head || !this.signals.has(value(e, 'signalKey', 'key'))) this.acks.delete(k);
    this.responders = this.responders.filter(r => r.expiresAt > this.head);
    this.onChange();
  }
  error(e) {
    const message = `${e.shortMessage ?? e.message ?? ''} ${e.details ?? ''}`;
    return /429|ANON_COST_LIMITED|quota|budget/i.test(message) ? 'Tiramisu query quota reached. Configure a server-held access key; never embed it in this app.' : (e.shortMessage ?? e.message ?? 'Network request failed.');
  }
  newWallet() {
    if (this.wallet) throw new Error('A temporary wallet is already active.');
    // No private key is exported, logged, persisted, or sent to the application server.
    const account = privateKeyToAccount(generatePrivateKey());
    this.wallet = createWalletClient({ account, chain: tiramisu, transport: http(CONFIG.http, { retryCount: 0, timeout: 15000 }) });
    return account.address;
  }
  async connectWallet(provider) {
    const accounts = await provider.request({ method: 'eth_requestAccounts' });
    const chainId = await provider.request({ method: 'eth_chainId' });
    if (Number(chainId) !== 7738577) throw new Error('Switch your wallet to Tiramisu (7738577), then connect again.');
    this.wallet = createWalletClient({ account: accounts[0], chain: tiramisu, transport: custom(provider) });
    return accounts[0];
  }
  address() { return typeof this.wallet?.account === 'string' ? this.wallet.account : this.wallet?.account?.address; }
  async balance() { return formatEther(await this.client.getBalance({ address: this.address() })); }
  signer() { if (!this.wallet) throw new Error('Create or connect a funded test wallet first.'); return this.wallet; }
  async record(kind, result) {
    const item = { kind, chainId: 7738577, creator: this.address(), entityKey: result.entityKey, txHash: result.txHash, expiresAt: result.expiresAt?.toString(), recordedAt: new Date().toISOString() };
    this.evidence.push(item); return result;
  }
  async submit(envelope, hours) {
    const signer = this.signer();
    if (![6, 24, 48].includes(Number(hours))) throw new Error('Invalid signal lease.');
    validateEnvelope(envelope, envelope.context);
    await this.loadResponders();
    if (!this.responders.length || envelope.recipients.some(r => !this.responders.some(k => k.pubkeyId === r.pubkeyId && k.keyEntity === r.keyEntity))) throw new Error('A trusted recipient key changed or expired. Create a fresh encrypted draft.');
    const c = envelope.context;
    const result = await signer.createEntity({ attributes: { type: str(TYPES.signal), zone: str(c.zone), need: str(c.need), priority: i32(c.priority), postedAt: u64(c.postedAt) }, payload: payload(envelope), contentType: 'application/json', flags, expires: ExpirationTime.fromHours(Number(hours)) });
    await this.record('signal', result); await this.hydrate(result.entityKey); return result;
  }
  async publishKey(responder) {
    if (!allowed(this.address(), CONFIG.responderOrgs)) throw new Error('This wallet is not in the deployed responder allow-list. Configure its public address first.');
    const result = await this.signer().createEntity({ attributes: { type: str(TYPES.responder), zone: str(ZONE), pubkeyId: str(responder.pubkeyId) }, payload: payload({ version: 1, publicKey: responder.jwk }), contentType: 'application/json', flags, expires: ExpirationTime.fromDays(30) });
    await this.record('responder_key', result); await this.loadResponders(); this.onChange(); return result;
  }
  async ack(entityKey) {
    if (!allowed(this.address(), CONFIG.responderOrgs)) throw new Error('Acknowledgements require an allow-listed responder wallet.');
    const signal = await this.client.getEntity(entityKey);
    validateSignal(signal, await this.client.getBlockNumber({ cacheTime: 0 }));
    const result = await this.signer().createEntity({ attributes: { type: str(TYPES.ack), signalKey: key(entityKey), ackedAt: u64(Date.now()) }, payload: new Uint8Array(), contentType: 'application/octet-stream', flags, expires: ExpirationTime.atBlock(signal.expiresAt + 21600n) });
    await this.record('ack', result); await this.hydrate(result.entityKey); return result;
  }
  async renew(entityKey, hours) {
    const entity = await this.client.getEntity(entityKey), head = await this.client.getBlockNumber({ cacheTime: 0 });
    if (!sameOwner(entity.owner, this.address())) throw new Error('Only this signal’s current owner can renew it.');
    leaseTarget(head, entity.expiresAt, hours);
    const result = await this.signer().extendEntity({ entityKey, expires: ExpirationTime.fromHours(Number(hours)) });
    await this.record('extension', result); await this.hydrate(entityKey); return result;
  }
  async safe(entityKey) {
    const entity = await this.client.getEntity(entityKey);
    if (!sameOwner(entity.owner, this.address())) throw new Error('Only the signal owner can remove it.');
    const result = await this.signer().deleteEntity({ entityKey });
    await this.record('delete', result); this.signals.delete(entityKey); this.onChange(); return result;
  }
  stop() { this.closed = true; this.pendingKeys.clear(); this.cleanup.splice(0).forEach(fn => fn()); }
}
function sameOwner(a, b) { return typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase(); }
