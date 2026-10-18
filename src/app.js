import { ArkivBoard } from './arkiv.js';
import { PracticeBoard } from './practice.js';
import { CONFIG } from './config.js';
import { FIXTURES, ZONE, TYPES, value, contextOf, sameAddress, allowed, sortSignals, trustedAck } from './domain.js';
import { encryptSignal, decryptSignal, generateResponderKey } from './crypto.js';
import * as storage from './storage.js';
import './styles.css';
import './theme.css';

const icons = {
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9S4 17 4 12V6l8-3Z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  board: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  medical: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6Z"/>',
  water: '<path d="M12 2C9 7 5 11 5 15a7 7 0 0 0 14 0c0-4-4-8-7-13Z"/><path d="M8 15a4 4 0 0 0 4 4"/>',
  road: '<path d="M7 3 3 21m14-18 4 18M12 3v3m0 4v4m0 4v3"/>',
  shelter: '<path d="m2 12 10-9 10 9M5 10v11h14V10M9 21v-8h6v8"/>',
  key: '<circle cx="8" cy="9" r="5"/><path d="m12 13 9 9m-4-4 3-3m-6 0 3-3"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  link: '<path d="M14 3h7v7m0-7L10 14M10 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/>',
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] ?? icons.shield}</svg>`;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const short = v => v ? `${v.slice(0, 6)}…${v.slice(-4)}` : 'Not connected';
const $ = selector => document.querySelector(selector);
let mode = 'practice', view = 'signals', filter = 'all', urgency = 'all', selected, state, practice, live, keyring = [], queued = [], lastEvent, status = { kind: 'practice', message: 'Local walkthrough · no on-chain writes' }, busy = false;
const decrypted = new Map();
let toastTimer, enterTimer, animateNext = true;
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// Entrance choreography runs on first paint and view/mode changes only, so filtering and live updates never replay it.
function enter() {
  const app = $('#app'); app.classList.add('enter'); clearTimeout(enterTimer); enterTimer = setTimeout(() => app.classList.remove('enter'), 1800);
  if (reducedMotion()) return;
  document.querySelectorAll('.stats strong').forEach(el => {
    const target = Number(el.textContent), start = performance.now();
    const tick = now => { const t = Math.min(1, (now - start) / 800); el.textContent = String(Math.round(target * (1 - (1 - t) ** 3))).padStart(2, '0'); if (t < 1) requestAnimationFrame(tick); };
    if (target > 0) requestAnimationFrame(tick);
  });
}
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 6500); }
function showDialog(title, content) {
  const dialog = $('#dialog');
  dialog.innerHTML = `<div class="dialog-head"><div><span class="eyebrow">VEIL / GLASS ISLE</span><h2 id="dialog-title">${esc(title)}</h2></div><button class="close" data-close aria-label="Close dialog">×</button></div>${content}`;
  dialog.querySelector('[data-close]').onclick = () => dialog.close();
  if (!dialog.open) dialog.showModal();
}
function download(name, content, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type })), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function ackFor(signal) {
  const orgs = mode === 'practice' ? [practice.org] : CONFIG.responderOrgs;
  return [...state.acks.values()].filter(e => trustedAck(e, signal, state.head, orgs));
}
function remaining(signal) { return Math.max(0, Number(signal.expiresAt - state.head) * 2); }
function duration(seconds) { return seconds >= 3600 ? `${Math.ceil(seconds / 3600)}h` : `${Math.ceil(seconds / 60)}m`; }
function age(signal) { const minutes = Math.max(0, Math.floor((Date.now() - Number(value(signal, 'posted_at', 'u64'))) / 60000)); return minutes < 1 ? 'Just posted' : minutes < 60 ? `${minutes}m ago` : `${Math.floor(minutes / 60)}h ago`; }
function badge(signal) { const acks = ackFor(signal); return acks.length ? `<span class="ack-badge">${icon('check')} Acknowledged${acks.some(a => a.expiresAt < signal.expiresAt + 21600n) ? ' · reconfirm lease' : ''}</span>` : '<span class="open-badge"><i></i> Awaiting response</span>'; }
function render() {
  if (!state) return;
  const signals = sortSignals([...state.signals.values()].filter(e => e.expiresAt > state.head));
  const urgent = signals.filter(e => value(e, 'priority', 'i32') === 3).length;
  const acked = signals.filter(e => ackFor(e).length).length;
  $('#app').innerHTML = `<div class="shell"><aside class="sidebar">
    <a class="brand" href="/" aria-label="Veil home"><span class="brand-mark">∨</span>veil<span class="brand-period">.</span></a>
    <div class="workspace-label">COORDINATION SPACE</div><div class="place"><div class="place-symbol">G<span>↗</span></div><div><strong>Glass Isle</strong><span>Fictional demonstration area</span></div></div>
    <nav aria-label="Main navigation"><button class="nav-button ${view === 'signals' ? 'active' : ''}" data-view="signals">${icon('board')} Signal board <span>${signals.length.toString().padStart(2, '0')}</span></button><button class="nav-button ${view === 'responders' ? 'active' : ''}" data-view="responders">${icon('key')} Responder space</button><button class="nav-button ${view === 'privacy' ? 'active' : ''}" data-view="privacy">${icon('shield')} Privacy & evidence</button></nav>
    <div class="sidebar-note">${icon('lock')}<h3>A little less exposed.</h3><p>Exact positions and details are encrypted for trusted responders. Only coarse signals are public.</p><button data-view="privacy">See the privacy boundary ${icon('arrow')}</button></div>
    <div class="sidebar-bottom"><span class="tiny-orbit"></span><span>Built on <strong>Arkiv</strong><small>The Web3 database</small></span><span class="arrow-up">↗</span></div>
  </aside><main>
    <header class="topbar"><div class="breadcrumb">Glass Isle <span>/</span> ${view === 'signals' ? 'Signal board' : view === 'responders' ? 'Responder space' : 'Privacy & evidence'}</div><div class="header-actions"><div class="mode-control" role="group" aria-label="Data source"><button data-mode="practice" aria-pressed="${mode === 'practice'}">Local walkthrough</button><button data-mode="live" aria-pressed="${mode === 'live'}">Tiramisu</button></div><button class="wallet-button" data-action="wallet">${icon('key')} ${mode === 'practice' ? 'Wallet setup' : short(live.address())}</button></div></header>
    <div class="page"><div class="source-label ${mode === 'live' ? 'live-label' : ''}"><i></i>${mode === 'practice' ? 'LOCAL WALKTHROUGH · ENCRYPTED IN YOUR BROWSER · NO CHAIN WRITES' : 'TIRAMISU TESTNET · CHAIN 7738577'}</div>
    ${view === 'signals' ? `<section class="hero"><div><div class="eyebrow">PRIVATE SIGNALS. SHARED RESPONSE.</div><h1>Help starts with a signal.<br><span>Keep the details private.</span></h1><p>A shared picture of what’s needed, without a public trail<br class="desktop-break"> to someone’s exact position.</p></div><button class="primary" data-action="compose">${icon('plus')} Post a synthetic signal</button></section>
    <section class="stats" aria-label="Board summary"><div><span class="stat-symbol">${icon('board')}</span><span>Active signals<strong>${signals.length.toString().padStart(2, '0')}</strong></span><small>Within this zone</small></div><div><span class="stat-symbol urgent-symbol">${icon('medical')}</span><span>High priority<strong>${urgent.toString().padStart(2, '0')}</strong></span><small>Needs attention</small></div><div><span class="stat-symbol">${icon('check')}</span><span>Acknowledged<strong>${acked.toString().padStart(2, '0')}</strong></span><small>Trusted responder${acked === 1 ? '' : 's'}</small></div></section>
    <div class="board-layout"><section class="signals-section"><div class="section-title"><h2>Signals in your zone <span>${ZONE}</span></h2><span class="sort-label">Priority, then newest ↓</span></div><div class="filters"><div class="need-filters" role="group" aria-label="Filter signals by need">${['all', ...FIXTURES.map(f => f.need)].map(n => `<button data-filter="${n}" aria-pressed="${filter === n}">${n === 'all' ? 'All needs' : icon(n) + n[0].toUpperCase() + n.slice(1)}</button>`).join('')}</div><select id="urgency" aria-label="Minimum priority"><option value="all" ${urgency === 'all' ? 'selected' : ''}>All priorities</option><option value="3" ${urgency === '3' ? 'selected' : ''}>High priority</option><option value="2" ${urgency === '2' ? 'selected' : ''}>Priority 2–3</option></select></div><div id="signal-list">${signalList(signals)}</div><div class="feed-footer"><span class="feed-dot"></span>${esc(mode === 'practice' ? 'Local examples · renew or remove one to explore' : status.message)}<span>${lastEvent && mode === 'live' ? 'Event received' : 'Details stay encrypted'}</span></div></section><aside class="zone-column">${zonePanel()}<div class="quiet-card">${icon('clock')}<h3>Signals have a lifetime.</h3><p>When a signal’s lease ends, it leaves the live board. Its owner can renew while help is still needed.</p><span>ENTITY EXPIRATION / USER CONTROLLED</span></div><button class="outbox-button" data-action="outbox">Encrypted outbox <span>${queued.length} ${icon('arrow')}</span></button></aside></div>` : view === 'responders' ? respondersView() : privacyView()}
    <footer class="footer"><span>VEIL <i> / </i> A quieter way to coordinate.</span><span>Privacy demo · Arkiv Global Tour Stop 2026 · Photo: <a href="https://commons.wikimedia.org/wiki/File:Green_cliffs_in_Ireland.jpg" target="_blank" rel="noopener" class="credit">Jon Sullivan, public domain</a></span><span>Internet required for Tiramisu ${icon('link')}</span></footer></div></main></div>`;
  bind();
  if (animateNext) { animateNext = false; enter(); }
}
function signalList(signals) {
  const rows = signals.filter(e => (filter === 'all' || value(e, 'need', 'str') === filter) && (urgency === 'all' || value(e, 'priority', 'i32') >= Number(urgency)));
  return rows.length ? rows.map(e => {
    const need = value(e, 'need', 'str'), priority = value(e, 'priority', 'i32'), fixture = FIXTURES.find(f => f.need === need);
    return `<article class="signal-card"><div class="need-icon ${need}">${icon(need)}</div><div class="signal-content"><div class="signal-heading"><h3>${esc(fixture.title)}</h3><span class="priority p${priority}">${priority === 3 ? 'High priority' : priority === 2 ? 'Priority 2' : 'Priority 1'}</span></div><div class="signal-meta"><span>ZONE ${ZONE}</span><b>·</b><span>${age(e)}</span><b>·</b><span>${icon('clock')} ~${duration(remaining(e))} left</span></div><div class="signal-status">${badge(e)}<span class="encrypted-label">${icon('lock')} Exact position encrypted</span></div></div><button class="card-open" data-open="${e.key}" aria-label="Open ${esc(fixture.title)} signal">${icon('arrow')}</button></article>`;
  }).join('') : `<div class="empty-state">${icon(mode === 'practice' ? 'board' : 'shield')}<h3>${mode === 'live' ? 'Your live zone starts here.' : 'No signals in this view.'}</h3><p>${mode === 'live' ? 'Connect to Tiramisu to read signals. A funded wallet and a published trusted responder key are required to post.' : 'Try another need or priority, or post a new fictional signal.'}</p><button class="secondary" data-action="${mode === 'live' ? 'refresh' : 'compose'}">${mode === 'live' ? 'Retry Tiramisu connection' : 'Post a synthetic signal'}</button>${mode === 'live' ? `<div class="inline-status" role="status">${esc(status.message)}</div>` : ''}</div>`;
}
function zonePanel() {
  return `<div class="zone-card"><div class="zone-header"><h3>Your coarse zone</h3><span>${ZONE}</span></div><div class="zone-art" role="img" aria-label="Abstract fictional Glass Isle zone illustration. No exact positions are shown."><svg viewBox="0 0 280 205" fill="none"><defs><pattern id="grid" width="23" height="23" patternUnits="userSpaceOnUse"><path d="M23 0H0v23" stroke="#c9d1bf" stroke-width=".7"/></pattern></defs><rect width="280" height="205" fill="url(#grid)"/><path d="M0 152c43-37 50-60 71-42s22 21 36 9 22-38 46-32 56 37 74 15 33-44 53-39" stroke="#b9c6ac" stroke-width="15"/><path class="dash" d="m74 39 95-12 57 72-28 74-89 5-54-64Z" fill="#dfe8cf" fill-opacity=".75" stroke="#8ea67e" stroke-dasharray="4 4"/><circle cx="140" cy="103" r="31" fill="#193e34" fill-opacity=".06"/><circle cx="140" cy="103" r="20" stroke="#193e34" stroke-opacity=".25"/><circle class="radar" cx="140" cy="103" r="20" stroke="#193e34" stroke-opacity=".4"/><circle class="radar two" cx="140" cy="103" r="20" stroke="#193e34" stroke-opacity=".4"/><circle cx="140" cy="103" r="5" fill="#193e34"/><path d="M140 76v-9m0 72v-9m-27-27h-9m72 0h-9" stroke="#193e34"/><text x="232" y="25" fill="#7e8c76" font-size="9" font-family="monospace">N ↑</text></svg><div class="map-caption">ILLUSTRATION ONLY · NO REAL LOCATION</div></div><div class="zone-info"><strong>Glass Isle <span>Fictional area</span></strong><p>4-character geohash · coarse by design.<br>Exact coordinates never appear here.</p></div><div class="zone-privacy">${icon('shield')} Public zone. Private details.</div></div>`;
}
function respondersView() {
  return `<section class="hero"><div><div class="eyebrow">VERIFY THE SOURCE. PROTECT THE DETAILS.</div><h1>Trust starts with<br><span>the creator.</span></h1><p>Responder encryption keys are accepted only from the configured<br class="desktop-break"> organization wallets. An editable field cannot establish trust.</p></div><button class="primary" data-action="responder-key">${icon('key')} Create responder key</button></section><div class="content-columns"><section class="white-panel"><h2>Zone responder keys <span class="count-tag">${state.responders?.length ?? 0}</span></h2><p>Public P-256 keys for zone ${ZONE}. ${mode === 'practice' ? 'These keys belong to this local walkthrough only.' : 'Trust is anchored to immutable on-chain creators.'}</p>${(state.responders ?? []).map(r => `<div class="key-row">${icon('key')}<div><strong>${mode === 'practice' ? 'Walkthrough responder' : 'Allow-listed organization'}</strong><code>${esc(r.pubkeyId.slice(0, 24))}…</code><small>Creator ${esc(short(r.creator))}</small></div><span class="verified">${icon('check')} ${mode === 'practice' ? 'Local' : 'Verified creator'}</span></div>`).join('') || '<div class="empty-inline">No trusted responder keys yet. Configure organization addresses, fund a wallet, then publish its public encryption key.</div>'}<button class="secondary" data-action="publish">Publish local public key to Tiramisu ${icon('arrow')}</button></section><section class="white-panel"><h2>Private keys stay here.</h2><p>Responder private ECDH keys are non-extractable WebCrypto keys stored in this browser’s IndexedDB. They are never bundled, uploaded, or printed.</p><div class="step"><span>01</span><p>Connect an approved responder wallet.</p></div><div class="step"><span>02</span><p>Generate a local encryption key and publish only its public half.</p></div><div class="step"><span>03</span><p>Open a signal, decrypt as a recipient, and append an authenticated acknowledgement.</p></div><p class="small-muted">${keyring.length} private key${keyring.length === 1 ? '' : 's'} saved on this device. Clearing browser storage loses decryption access. A compromised browser can still use local keys.</p></section></div>`;
}
function privacyView() {
  return `<section class="hero"><div><div class="eyebrow">A CLEAR BOUNDARY. NO INVISIBLE PROMISES.</div><h1>Public enough to coordinate.<br><span>Private where it matters.</span></h1><p>Encryption protects signal details. It does not make public<br class="desktop-break"> metadata anonymous or erase transaction history.</p></div><button class="secondary" data-action="evidence">Download session evidence ${icon('arrow')}</button></section><div class="privacy-grid"><section class="white-panel"><div class="panel-icon">${icon('board')}</div><h2>Visible to everyone</h2><ul><li>Coarse zone, need, priority, and posting time</li><li>Creator/owner wallets and transaction timing</li><li>Expiration, recipient references, and payload size</li><li>Acknowledgement links and responder wallets</li></ul><p>Coarse metadata can still be sensitive. All data here is synthetic.</p></section><section class="white-panel protected"><div class="panel-icon">${icon('lock')}</div><h2>Inside the encryption</h2><ul><li>Exact fictional position and synthetic details</li><li>A fresh AES-GCM key for every signal</li><li>Separate ECDH key wrapping per recipient</li><li>Authenticated metadata; tampering fails decryption</li></ul><p>Authorized responders can read and copy decrypted details.</p></section><section class="white-panel"><div class="panel-icon">${icon('clock')}</div><h2>Time is a product choice</h2><p>Choose a 6, 24, or 48-hour lease. “Still need help” sets a later expiry. “I’m safe” removes the live entity.</p><p>Entity Expiration follows block production. Times shown are approximate. Historical ciphertext and downloaded copies may remain.</p></section><section class="white-panel"><div class="panel-icon">${icon('shield')}</div><h2>Verify what really happened</h2><p>${mode === 'practice' ? 'You are in the local walkthrough. Its encrypted examples, acknowledgements, and keys are not on-chain evidence.' : 'Live entities can be inspected on the explorer. Session evidence includes only successful SDK transaction results; refresh does not create evidence.'}</p><p>No connectivity guarantee. Internet and funded signing wallets are required for Tiramisu. No rescue or delivery guarantees.</p></section></div><div class="evidence-strip"><span>${icon('link')} Session creation and change records</span><strong>${live?.evidence.length ?? 0} confirmed transaction result${live?.evidence.length === 1 ? '' : 's'}</strong><button data-action="evidence">Export JSON ${icon('arrow')}</button></div>`;
}
function bind() {
  document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { if (view !== b.dataset.view) animateNext = true; view = b.dataset.view; render(); });
  document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => changeMode(b.dataset.mode));
  document.querySelectorAll('[data-filter]').forEach(b => b.onclick = () => { filter = b.dataset.filter; render(); });
  document.querySelectorAll('[data-open]').forEach(b => b.onclick = () => openSignal(b.dataset.open));
  document.querySelectorAll('[data-action]').forEach(b => b.onclick = () => action(b.dataset.action));
  if ($('#urgency')) $('#urgency').onchange = e => { urgency = e.target.value; render(); };
}
async function action(name) {
  try {
    if (name === 'compose') compose();
    if (name === 'wallet') walletDialog();
    if (name === 'outbox') outboxDialog();
    if (name === 'responder-key') {
      if (mode === 'practice') { toast('The walkthrough already has a temporary responder key. Switch to Tiramisu to create a persistent device key.'); return; }
      const responder = await generateResponderKey();
      keyring.push(responder); await storage.write('responderKeys', keyring); render(); toast('Non-extractable responder key saved in this browser. Its public half is ready to publish.');
    }
    if (name === 'publish') {
      if (mode !== 'live') throw new Error('Switch to Tiramisu to publish a real responder key.');
      if (!keyring.length) throw new Error('Create a local responder key first.');
      await transact(() => live.publishKey(keyring.at(-1)), 'Public responder key published.');
    }
    if (name === 'refresh') await transact(() => live.refresh(), 'Tiramisu snapshot checked.');
    if (name === 'evidence') download('veil-session-evidence.json', JSON.stringify({ syntheticOnly: true, chainId: 7738577, exportedAt: new Date().toISOString(), transactions: live?.evidence ?? [], note: 'Local walkthrough records are excluded. Save this file before reloading.' }, null, 2));
  } catch (e) { toast(e.message); }
}
async function changeMode(next) {
  if (next === mode) return;
  if (busy) { toast('Wait for the current transaction to finish before switching.'); return; }
  mode = next; decrypted.clear(); selected = undefined; animateNext = true;
  if (next === 'practice') { live?.stop(); state = practice; status = { kind: 'practice', message: 'Local walkthrough · no on-chain writes' }; render(); return; }
  const wallet = live?.wallet, evidence = live?.evidence;
  live?.stop(); live = new ArkivBoard(() => { if (mode === 'live') render(); }, (kind, message) => {
    if (mode !== 'live') return;
    if (kind === 'event') {
      const firstEvent = !lastEvent; lastEvent = Date.now();
      if (status.kind === 'quota') return;
      status = { kind, message };
      if (firstEvent) render();
      return;
    }
    if (status.kind === 'quota' && kind !== 'quota' && !(kind === 'snapshot' && !live.quotaBlocked)) return;
    status = { kind, message }; render();
  });
  if (wallet) live.wallet = wallet; if (evidence) live.evidence = evidence;
  state = live; status = { kind: 'connecting', message: 'Connecting to Tiramisu…' }; render();
  try { await live.start(); await storage.write('cachedRecipients', live.responders); }
  catch (e) { if (status.kind !== 'quota') status = { kind: 'error', message: live.error(e) }; render(); }
}
function compose() {
  showDialog('Post a synthetic signal', `<p class="dialog-intro">Choose a fictional scenario. No free text, real people, or device location are collected.</p><form id="signal-form"><label>Fictional need<select name="fixture">${FIXTURES.map(f => `<option value="${f.id}">${esc(f.title)}</option>`).join('')}</select></label><div id="fixture-preview" class="fixture-preview"></div><div class="form-row"><label>Priority<select name="priority"><option value="1">1 · Standard</option><option value="2" selected>2 · Needs attention</option><option value="3">3 · High</option></select></label><label>Entity Expiration<select name="hours"><option value="6">Approximately 6 hours</option><option value="24">Approximately 24 hours</option><option value="48" selected>Approximately 48 hours</option></select></label></div><div class="encryption-note">${icon('lock')}<div><strong>Encrypted before it leaves this browser.</strong><p>Only coarse zone ${ZONE}, need, priority, and time are public. No trusted keys means no submission.</p></div></div><label class="checkbox"><input type="checkbox" name="confirm" required> I understand this is fictional demo data, not a request for real help.</label><div id="form-error" class="form-error" role="alert"></div><button class="primary full" type="submit">${icon('lock')} ${mode === 'practice' ? 'Encrypt & add local signal' : 'Encrypt & submit to Tiramisu'}</button><p class="small-muted">${mode === 'practice' ? 'Local walkthrough: no transaction or wallet funding.' : 'A funded wallet is required online. While offline, ciphertext can be queued with previously validated keys.'}</p></form>`);
  const form = $('#signal-form');
  const preview = () => { const f = FIXTURES.find(f => f.id === form.elements.fixture.value); $('#fixture-preview').textContent = f.detail; form.elements.priority.value = f.priority; };
  form.elements.fixture.onchange = preview; preview();
  form.onsubmit = async e => {
    e.preventDefault(); if (busy) return;
    const button = form.querySelector('[type=submit]'); button.disabled = true;
    try {
      const fixture = FIXTURES.find(f => f.id === form.elements.fixture.value), hours = Number(form.elements.hours.value);
      if (!form.elements.confirm.checked) throw new Error('Confirm the synthetic-only boundary.');
      if (mode === 'live' && navigator.onLine) { live.head = await live.client.getBlockNumber({ cacheTime: 0 }); await live.loadResponders(); }
      let recipients = state.responders ?? [];
      if (mode === 'live' && !navigator.onLine && !recipients.length) recipients = await storage.read('cachedRecipients') ?? [];
      // Cached keys also have to be tied to the currently deployed allow-list.
      if (mode === 'live') recipients = recipients.filter(r => allowed(r.creator, CONFIG.responderOrgs));
      if (!recipients.length) throw new Error('No trusted responder keys. Open Responder space and complete the setup flow.');
      const context = { type: TYPES.signal, zone: ZONE, need: fixture.need, priority: Number(form.elements.priority.value), postedAt: String(Date.now()) };
      const envelope = await encryptSignal({ synthetic: true, position: fixture.position, details: fixture.detail }, context, recipients);
      if (mode === 'live' && !navigator.onLine) {
        await storage.queue({ envelope, hours }); queued = await storage.read('outbox') ?? []; $('#dialog').close(); render(); toast('Ciphertext queued. It will be revalidated and submitted after connectivity and funded signing return.'); return;
      }
      await transact(() => state.submit(envelope, hours), mode === 'practice' ? 'Encrypted signal added locally. No on-chain write.' : 'Encrypted signal confirmed on Tiramisu.');
      $('#dialog').close(); render();
      if (mode === 'live') await storage.write('cachedRecipients', live.responders);
    } catch (error) { $('#form-error').textContent = live && mode === 'live' ? live.error(error) : error.message; }
    finally { button.disabled = false; }
  };
}
function openSignal(entityKey) {
  const signal = state.signals.get(entityKey); if (!signal) { toast('This signal is no longer live.'); return; }
  selected = entityKey;
  const need = value(signal, 'need', 'str'), fixture = FIXTURES.find(f => f.need === need), owner = sameAddress(signal.owner, state.address()), clear = decrypted.get(entityKey), acks = ackFor(signal);
  showDialog(fixture.title, `<div class="signal-dialog-meta"><span class="priority p${value(signal, 'priority', 'i32')}">Priority ${value(signal, 'priority', 'i32')}</span><span>ZONE ${ZONE}</span><span>~${duration(remaining(signal))} left</span></div><div class="detail-box ${clear ? 'unlocked' : ''}">${icon(clear ? 'shield' : 'lock')}<h3>${clear ? 'Decrypted on this device' : 'Exact position & details are encrypted'}</h3>${clear ? `<p>${esc(clear.details)}</p><code>${esc(clear.position.grid)} · x ${esc(clear.position.x)}, y ${esc(clear.position.y)}</code>` : '<p>The public board cannot read these details. Decryption requires a recipient’s private key.</p>'}<button class="secondary" id="decrypt">${clear ? 'Hide decrypted details' : mode === 'practice' ? 'Decrypt as walkthrough responder' : 'Decrypt with this device’s key'}</button></div><div class="detail-line"><span>Acknowledgement</span>${badge(signal)}</div>${acks.length ? `<p class="small-muted">Creator ${esc(short(acks[0].creator))} · ${new Date(Number(value(acks[0], 'acked_at', 'u64'))).toLocaleString()}${mode === 'practice' ? ' · local only' : ' · immutable on-chain creator'}</p>` : ''}<div class="detail-line"><span>Signal owner</span><code>${esc(short(signal.owner))}${owner ? ' · this session' : ''}</code></div><div class="detail-line"><span>Entity Expiration</span><code>Block ${signal.expiresAt}</code></div><div class="dialog-actions"><button class="primary" id="ack">${icon('check')} ${acks.length ? 'Reconfirm acknowledgement' : 'Acknowledge signal'}</button>${owner ? '<button class="secondary" id="renew">Still need help</button><button class="text-button" id="safe">I’m safe · remove live signal</button>' : ''}</div><div class="dialog-footnote">${mode === 'practice' ? 'Local walkthrough: these records are not Arkiv entities.' : `<a href="${CONFIG.explorer}/address/${signal.creator}" target="_blank" rel="noopener">Open creator in explorer ${icon('link')}</a> · Find this entity using its key.`}</div><button class="text-button" id="inspect">Inspect public envelope ${icon('arrow')}</button><div id="signal-error" class="form-error" role="alert"></div>`);
  $('#decrypt').onclick = async () => {
    if (clear) { decrypted.delete(entityKey); openSignal(entityKey); return; }
    try {
      const keys = mode === 'practice' ? [practice.responder] : keyring;
      const responder = keys.find(k => signal.toJson().recipients.some(r => r.pubkeyId === k.pubkeyId));
      if (!responder) throw new Error('No recipient private key is stored in this browser. Create and publish a responder key before posting a new signal.');
      const result = await decryptSignal(signal.toJson(), contextOf(signal), responder);
      if (!result.synthetic || !result.position || typeof result.details !== 'string') throw new Error('Payload is not a supported synthetic signal.');
      decrypted.set(entityKey, result); openSignal(entityKey);
    } catch (e) { $('#signal-error').textContent = e.message; }
  };
  $('#ack').onclick = () => signalAction(() => state.ack(entityKey), 'Acknowledgement created.');
  if ($('#renew')) $('#renew').onclick = () => renewDialog(entityKey);
  if ($('#safe')) $('#safe').onclick = () => safeDialog(entityKey);
  $('#inspect').onclick = () => inspect(signal);
}
async function signalAction(fn, message) {
  try { await transact(fn, message); if (selected && state.signals.has(selected)) openSignal(selected); else $('#dialog').close(); }
  catch (e) { if ($('#signal-error')) $('#signal-error').textContent = e.message; else toast(e.message); }
}
function renewDialog(entityKey) {
  showDialog('Still need help', `<p>Lifetime Extension sets a new expiry from now. It must be later than the current expiry; it does not add a duration to the old one.</p><label>New lease<select id="renew-hours"><option value="6">6 hours from now</option><option value="24">24 hours from now</option><option value="48" selected>48 hours from now</option></select></label><p class="small-muted">Times are approximate. No automatic renewal. Responders may need to reconfirm after renewal.</p><div id="renew-error" class="form-error" role="alert"></div><button class="primary full" id="confirm-renew">Renew this signal</button>`);
  $('#confirm-renew').onclick = async () => { try { await transact(() => state.renew(entityKey, Number($('#renew-hours').value)), 'Signal lease renewed.'); openSignal(entityKey); } catch(e) { $('#renew-error').textContent = e.message; } };
}
function safeDialog(entityKey) {
  showDialog('Remove this live signal?', `<p>“I’m safe” deletes this signal from the live board. Historical ciphertext and copies may remain. It does not publish a safety status.</p><p class="small-muted">Alternatively, close this dialog and let its lease end without another transaction.</p><div id="remove-error" class="form-error" role="alert"></div><button class="primary full" id="confirm-safe">${mode === 'practice' ? 'Remove local example' : 'Sign removal transaction'}</button>`);
  $('#confirm-safe').onclick = async () => { try { await transact(() => state.safe(entityKey), 'Live signal removed.'); decrypted.delete(entityKey); selected = undefined; $('#dialog').close(); render(); } catch(e) { $('#remove-error').textContent = e.message; } };
}
function inspect(signal) {
  const publicRecord = { key: signal.key, creator: signal.creator, owner: signal.owner, expiresAt: signal.expiresAt, attributes: signal.attributes, envelope: signal.toJson() };
  showDialog('What the public record exposes', `<p>Coarse metadata and ciphertext only. This view does not include decrypted details or secret keys. ${mode === 'practice' ? '<strong>Local walkthrough — not an explorer record.</strong>' : 'Use the creator address and entity key to find the on-chain record.'}</p><pre class="envelope">${esc(JSON.stringify(publicRecord, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2))}</pre><button class="secondary" id="copy-key">Copy entity key</button>${mode === 'live' ? `<a class="secondary" target="_blank" rel="noopener" href="${CONFIG.explorer}/address/${signal.creator}">Open creator in explorer ${icon('link')}</a>` : ''}`);
  $('#copy-key').onclick = async () => { try { await navigator.clipboard.writeText(signal.key); toast('Entity key copied.'); } catch { toast('Clipboard unavailable. Select the key in the public record.'); } };
}
function walletDialog() {
  const address = live?.address();
  showDialog('Set up a test wallet', `<p class="dialog-intro">Browsing is open. Tiramisu writes need a wallet funded with test GLM. Use a throwaway wallet; no real funds are needed.</p><div class="setup-steps"><div class="step"><span>01</span><div><strong>Create a temporary browser wallet</strong><p>Its private key stays in memory. Reloading loses control of signals it owns. Do not fund it with real assets.</p></div></div><button class="primary full" id="generate-wallet" ${address ? 'disabled' : ''}>${address ? 'Temporary / connected wallet active' : 'Generate temporary wallet'}</button><div class="wallet-address"><span>PUBLIC FUNDING ADDRESS</span><code id="funding-address">${address ?? 'Generate a wallet to see its address'}</code>${address ? '<button class="text-button" id="copy-address">Copy address</button>' : ''}</div><div class="step"><span>02</span><div><strong>Fund it through Arkiv Hub</strong><p>The Hub may require its own connected-wallet sign-in. Paste the public recipient address if supported. If the faucet only funds its connected wallet, use an injected wallet for signing or transfer test GLM to this address.</p></div></div><a class="secondary full" href="https://hub.arkiv.network" target="_blank" rel="noopener">Open Hub faucet ${icon('link')}</a><div class="step"><span>03</span><div><strong>Check funds, then post</strong><p>Published trusted responder keys and working RPC quota are also required. A public board cannot keep an API key secret.</p></div></div><div class="button-row"><button class="secondary" id="check-balance" ${address ? '' : 'disabled'}>Check test balance</button><button class="secondary" id="connect-wallet">Connect browser wallet</button></div><p id="balance-result" class="small-muted" role="status"></p><p class="small-muted">Responder allow-list: ${CONFIG.responderOrgs.length ? CONFIG.responderOrgs.map(short).join(', ') : 'not configured yet'}. Add public organization addresses to src/config.js before deployment. Private keys are never entered here.</p></div>`);
  $('#generate-wallet').onclick = () => {
    try { if (!live) live = new ArkivBoard(() => { if (mode === 'live') render(); }, () => {}); live.newWallet(); walletDialog(); render(); } catch (e) { toast(e.message); }
  };
  if ($('#copy-address')) $('#copy-address').onclick = async () => { try { await navigator.clipboard.writeText(address); toast('Public address copied.'); } catch { toast('Copy the displayed public address manually.'); } };
  $('#check-balance').onclick = async () => { try { $('#balance-result').textContent = `${await live.balance()} test GLM`; } catch(e) { $('#balance-result').textContent = live.error(e); } };
  $('#connect-wallet').onclick = async () => {
    try {
      if (!window.ethereum) throw new Error('No injected wallet found. Install a browser wallet or use the temporary wallet flow.');
      if (!live) live = new ArkivBoard(() => { if (mode === 'live') render(); }, () => {});
      await live.connectWallet(window.ethereum); walletDialog(); render();
    } catch(e) { $('#balance-result').textContent = e.message; }
  };
}
function outboxDialog() {
  showDialog('Encrypted outbox', `<p>Only ciphertext is saved. Recipients are revalidated before sending. A changed or retired recipient key requires a fresh draft.</p><p class="small-muted">Your browser wallet is temporary. After a reload, generate/connect and fund a signer before sending. No background signing occurs while this page is closed.</p><div class="outbox-list">${queued.length ? queued.map(e => `<div class="outbox-row"><div><strong>${esc(e.envelope.context.need)} · zone ${esc(e.envelope.context.zone)}</strong><small>${new Date(e.queuedAt).toLocaleString()} · ${e.hours}h lease</small></div><button class="text-button" data-discard="${e.id}">Discard</button></div>`).join('') : '<div class="empty-inline">Your outbox is clear. Encrypted offline drafts will appear here.</div>'}</div><div id="outbox-error" class="form-error" role="alert"></div><button class="primary full" id="send-outbox" ${queued.length ? '' : 'disabled'}>Submit queued ciphertext</button>`);
  document.querySelectorAll('[data-discard]').forEach(b => b.onclick = async () => { queued = queued.filter(e => e.id !== b.dataset.discard); await storage.write('outbox', queued); outboxDialog(); render(); });
  $('#send-outbox').onclick = async () => { try { await flushOutbox(); outboxDialog(); } catch(e) { $('#outbox-error').textContent = e.message; } };
}
async function flushOutbox() {
  if (mode !== 'live' || !navigator.onLine || busy || !queued.length) throw new Error('Switch to Tiramisu with a funded signing wallet and internet connection.');
  await transact(async () => {
    while (queued.length) {
      const entry = queued[0];
      await live.submit(entry.envelope, entry.hours);
      // Remove only after confirmed SDK success; no silent plaintext fallback.
      queued = queued.slice(1); await storage.write('outbox', queued);
    }
  }, 'Queued ciphertext submitted.');
  render();
}
async function transact(fn, success) {
  if (busy) throw new Error('Another operation is still pending.');
  busy = true; document.body.classList.add('pending');
  try { const result = await fn(); toast(success); return result; }
  finally { busy = false; document.body.classList.remove('pending'); }
}
async function main() {
  try { keyring = await storage.read('responderKeys') ?? []; queued = await storage.read('outbox') ?? []; }
  catch { toast('Persistent browser storage is unavailable. Offline outbox and saved responder keys will not work.'); }
  practice = new PracticeBoard(() => { if (mode === 'practice') render(); }); state = practice;
  await practice.start(); render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => toast('Offline app shell could not be cached.'));
  window.addEventListener('online', () => {
    if (mode !== 'live') return;
    live.refresh().then(async () => { await storage.write('cachedRecipients', live.responders); if (live.wallet && queued.length) await flushOutbox(); }).catch(e => toast(live.error(e)));
  });
  window.addEventListener('offline', () => { if (mode === 'live') { status = { kind: 'offline', message: 'Offline · only encrypted drafts can be queued' }; render(); } });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && mode === 'live' && navigator.onLine && !busy) live.refresh().catch(e => toast(live.error(e)));
  });
  window.addEventListener('pagehide', () => live?.stop());
  window.addEventListener('beforeunload', e => { if (busy || live?.wallet) { e.preventDefault(); e.returnValue = ''; } });
}
main().catch(error => { $('#app').textContent = `Veil could not open: ${error.message}. Use a modern browser on HTTPS or localhost.`; });
