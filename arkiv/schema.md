# Veil — approved schema and data contract

Status: approved by the builder on 17 October 2026. Application and local tests implemented; live acceptance awaits funded wallets and RPC quota. The local walkthrough is not chain evidence.
Track: Privacy (Global). Arkiv is the Web3 database and the primary shared data layer.

**Synthetic demo data. Fictional area, fictional coordinates, fictional needs. This demo is not a rescue service.** No device geolocation, real incidents, names, telephone numbers, or hashes of personal information.

## 1. Questions the product answers

1. Which live signals in my coarse zone match a need and minimum priority?
2. Which public encryption keys were published by this zone's approved responder organizations?
3. Has a known responder acknowledged this signal, and when does its current lease end?

## 2. Network and contract version

- Tiramisu chain ID: `7738577`.
- HTTP: `https://rpc.tiramisu.db-chain.testnet.arkiv.network`.
- WebSocket: `wss://rpc.tiramisu.db-chain.testnet.arkiv.network`.
- Explorer: https://tiramisu.explorer.arkiv.network
- Installed and pinned: `@arkiv-network/sdk@0.8.1`, `viem@2.57.7`; package-lock.json records the dependency graph.
- One additional public attribute, `type`, namespaces the shared database with values `veil:v1:signal`, `veil:v1:responder_key`, `veil:v1:ack`. It combines app, version, and entity discriminator without a separate project attribute. A copied namespace does not establish trust.
- Use explicit `str`, `i32`, `u64`, and `key` constructors from `@arkiv-network/sdk/attr`. `u64` decodes to bigint; serialize it as a decimal string in JSON evidence. No filtering on payload or `$createdAt`.

## 3. Arkiv entities

### signal

| Public attribute | SDK type | Contract / purpose |
| --- | --- | --- |
| type | str | `veil:v1:signal` |
| zone | str | Four-character geohash label; fixed synthetic fixture `s000` initially |
| need | str | `medical`, `water`, `road`, or `shelter` |
| priority | i32 | Integer 1–3; 3 is most urgent |
| posted_at | u64 | Encryption/draft-time Unix milliseconds; client asserted, not authoritative. Offline drafts may predate chain submission. |

Payload: versioned JSON encryption envelope, `contentType: application/json`. Exact synthetic position and fictional details exist only within its ciphertext. Public envelope fields: algorithm/version, fresh ephemeral ECDH public key, AES-GCM nonce, ciphertext/tag, and per-recipient wrapped-key entries (`pubkeyId`, responder-key entity reference, HKDF salt, wrapping nonce, wrapped AES key). Recipient identifiers, sizes, and recipient count remain visible metadata.

Planned encryption: fresh random AES-256-GCM data key per signal; fresh P-256 ECDH ephemeral key pair; ECDH plus HKDF-SHA-256 derives an independent wrapping key for each validated zone responder public key. Wrap the data key using AES-GCM with a fresh 96-bit nonce. Bind version/type/zone/need/priority/postedAt, ephemeral key, and recipient identities in canonical authenticated additional data; bind each wrapper to its recipient key reference. No private ECDH key or plaintext data key is uploaded. Implementation and tamper tests are pending.

Creation flags: `{ readonly: true, permissionlessExtension: false }`. Reporter owns the entity; attributes and ciphertext remain fixed. A correction requires a new signal. One throwaway posting wallet per reporting session minimizes cross-signal linkage, but does not provide anonymity.

Entity Expiration: user chooses approximately 6, 24, or 48 hours; default 48. Set `expires: ExpirationTime.fromHours(selectedHours)`. The SDK converts durations at nominal two-second blocks; returned/read-back `expiresAt` is a block height, and wall-clock estimates must be labelled approximate.

Lifetime Extension: “Still need help” calls `extendEntity({ entityKey, expires: ExpirationTime.fromHours(selectedHours) })` from the owning reporter wallet. This sets a new expiry from the inclusion block. Only offer a choice whose computed target is strictly later than the current expiry; handle races/reverts and read back the settled expiry. Do not auto-renew. An expired signal needs a new submission.

“I'm safe — remove live signal” calls `deleteEntity({ entityKey })` from its owner. On failure, retain the signal and show pending/error; never falsely show deletion. Stopping renewal is the no-transaction alternative. Deletion and expiration remove live availability, not historical transaction data or copies others already downloaded.

### responder_key

| Public attribute | SDK type | Contract / purpose |
| --- | --- | --- |
| type | str | `veil:v1:responder_key` |
| zone | str | Four-character synthetic zone |
| pubkey_id | str | SHA-256 fingerprint of the canonical public P-256 key, not personal data |

Payload: public JWK (`kty: EC`, `crv: P-256`, `x`, `y`; never `d`) plus envelope version. `contentType: application/json`. Validate the JWK, curve, fingerprint, flags, creator, zone, and expiration before encrypting. A fingerprint is an identifier, not an authorization mechanism.

Only accept live keys from the configured per-zone allow-list of responder-org wallets using **`createdBy(orgAddress)`**. Query once per org and merge/deduplicate. Repeating `createdBy` on the same builder replaces the filter; it does not union orgs. Pin actual public org addresses in deployment configuration and evidence before publishing; there are none configured yet. If no trusted usable key exists, block submission; never downgrade to plaintext or encrypt to an untrusted key.

Flags: `{ readonly: true, permissionlessExtension: false }`. Entity Expiration: 30 days. Rotate by publishing a fresh key entity and retiring the old one from new encryption. Retain old private decryption keys locally for live signals that already reference them. Deleting a public key does not revoke access to ciphertext already encrypted for it. Rotation/revocation is operational, not retroactive secrecy.

### ack

| Public attribute | SDK type | Contract / purpose |
| --- | --- | --- |
| type | str | `veil:v1:ack` |
| signal_key | key | Referenced signal's 32-byte entity key |
| acked_at | u64 | Unix milliseconds, client asserted |

Payload: empty `Uint8Array`; `contentType: application/octet-stream`. No responder name or location. Flags: `{ readonly: true, permissionlessExtension: false }`. Acks are append-only in application behavior; owners can still delete/extend/transfer them at protocol level, so do not claim irrevocable persistence.

Entity Expiration: at creation, read the signal's settled expiry and use `ExpirationTime.atBlock(signal.expiresAt + 21600n)`, approximately 12 hours beyond that lease. A later signal renewal can outlive an earlier ack: responder creates a new ack for the renewed lease. Old ack is still an acknowledgement of the original signal until it expires; show its time and request renewed confirmation if it no longer covers the signal's current lease. The reporter cannot extend someone else's ack.

Count an ack only when its immutable `entity.creator` is in the signal zone's responder allow-list, its type/fields/flags validate, and the referenced signal exists. Never trust an `org` payload field or current owner for authorship. Deduplicate by creator for counts; acknowledgement is not proof that help arrived. Never mutate signal for status. Ack-to-signal linkage and responder wallet are public metadata.

## 4. Exact planned queries

These are verified against the installed query builder and rendered offline by `npm run verify:sdk`. They become application queries after approval. Live execution is recorded in evidence.md; empty results are not proof of writes.

```js
import { createPublicClient } from '@arkiv-network/sdk';
import { tiramisu } from '@arkiv-network/sdk/chains';
import { str, i32, key } from '@arkiv-network/sdk/attr';
import { eq, gte } from '@arkiv-network/sdk/query';
import { http } from 'viem';
const client = createPublicClient({ chain: tiramisu, transport: http() });
const zone = 's000';

// Q1: live zone feed (optionally add need and numeric priority predicates).
const feed = client.select()
  .where(eq('type', str('veil:v1:signal')), eq('zone', str(zone)))
  .limit(200);
const filtered = client.select()
  .where(eq('type', str('veil:v1:signal')), eq('zone', str(zone)))
  .where(eq('need', str('water')), gte('priority', i32(2)))
  .limit(200);

// Q2: run separately for each real configured orgAddress.
const keys = client.select()
  .where(eq('type', str('veil:v1:responder_key')), eq('zone', str(zone)))
  .createdBy(orgAddress).limit(200);

// Q3: run separately for each allow-listed responder in this signal's zone.
const acks = client.select()
  .where(eq('type', str('veil:v1:ack')), eq('signal_key', key(signalKey)))
  .createdBy(orgAddress).limit(200);

// Q4: owner control, not responder trust.
const mine = client.select()
  .where(eq('type', str('veil:v1:signal')), eq('zone', str(zone)))
  .ownedBy(reporterAddress).limit(200);

let page = await feed.fetch();
const all = [...page.entities];
while (page.hasNextPage()) {
  page = await page.next();
  all.push(...page.entities);
}
// For resumption, rebuild the identical query and selection, then .cursor(savedCursor).
// Sort all pages in the client by priority descending, posted_at descending, key as tie-breaker.
// Read attributes via .value after validating .type. Timestamp ordering is reporter asserted.
```

Fetch `getEntity(entityKey)` for event hydration, pre-renew ownership/expiry checks, envelope validation, and explorer inspection. No `orderBy`. Do not apply a top-N limit before sorting the full relevant result set. Initial demo volume is deliberately small.

## 5. Event-driven feed

Use a separate `createPublicClient({ chain: tiramisu, transport: webSocket(theWsUrl) })` with `webSocket` from viem. Call `watchEntityEvents` with callbacks and **no `fromBlock`**. Installed SDK delegates to viem `watchEvent`; installed viem selects subscriptions for WebSocket transport and polling when `fromBlock` is set or HTTP is used.

No server-side zone/type filter exists in `WatchEntityEventsParameters`. It subscribes to Arkiv operation events network-wide. Hydrate new entity keys with `getEntity`, then validate namespace, zone, schema, and immutable creator locally. A creation event's owner is not proof of creator. Bound concurrent hydration and deduplicate by transaction hash/log index; show connection/error state and apply rate-limit backoff.

Subscribe before initial queries, buffer events during the snapshot, then merge by key and block/log order. On reconnect, perform a one-off snapshot reconciliation, not a periodic refresh loop. Watch delete, extension, and ownership events as well as creation. Expiration emits no entity event: locally hide entries at their observed expiry using current block information and revalidate on focus/reconnect. Never claim the expiry removal itself is pushed by the entity watcher. Actual socket delivery and reconnection tests remain pending.

## 6. Privacy boundaries and offline behavior

- Four-character geohash is deliberately coarse: its grid spans 0.3515625 degrees longitude by 0.17578125 degrees latitude (roughly 39 by 20 km at the equator). This follows the 20-bit geohash grid; it is not a privacy guarantee. Fixture `s000` is an arbitrary synthetic zone for fictional Glass Isle; no actual incident or place is implied. Exact positions use an invented local coordinate grid, with no real device coordinates.
- Public: type, zone, need, priority, posted_at; wallet creator/owner, transaction timing, expiry, encrypted payload sizes, recipient-key references, key publishers, and ack linkage. Coarse medical needs can themselves be sensitive; synthetic-only use is mandatory.
- Exact coordinates/details stay off Arkiv in plaintext. Encrypted copies go on Arkiv. Secret wallet keys, responder private ECDH keys, raw signal AES keys, and plaintext drafts stay off Arkiv entirely. This is confidentiality against public readers, not anonymity or protection from an authorized/compromised responder.
- Proposed PWA stores encrypted outbox entries in IndexedDB. Offline drafting requires previously validated cached public keys; otherwise do not save a plaintext draft. Revalidate the original recipients before submission; never transmit an unvalidated stale queue. If original keys are retired, require a new draft/envelope for the current recipients. Ciphertext alone cannot be rewrapped after the local AES key is lost. Without cached trusted keys the user can only draft in volatile memory. No secrets in the service-worker cache.
- Submission needs internet and a funded throwaway wallet. Wallet generation uses browser memory; do not persist/export private keys to source, logs, or storage. CLI keys, if used later, come from environment variables only. A reload loses an in-memory wallet and control of its signals; disclose before posting. Offline ciphertext can survive reload but cannot submit until a funded signer is available. Responder key persistence/unlock design must be verified before claiming durable local decryption.
- No total cellular shutdown claim. No relay in scope. Public browsing needs no login; funded signing is required to post or acknowledge. Public responder view shows metadata; authorized responder secrets must never be bundled for no-login viewing.
- No erasure, forward-secrecy, delivery, identity, or rescue guarantees. Losing the private responder key loses decryption. Entity Expiration controls live retention, not copies/history.

## 7. Why Arkiv and acceptance evidence

Proposed value: independent responders query the same public ciphertext and verify acknowledgement creators without a team-operated database API. Postgres/our own API could implement the workflow, but would put availability, query access, and authorship mediation under that operator. IPFS alone needs separate indexed discovery and active-lease state; a subgraph needs another write/event source and indexing. Do not claim this workflow is impossible elsewhere or all Arkiv properties are unique.

After approval: demonstrate trusted key publication, encrypted signal write/read/decrypt, rejection of an unlisted creator, authenticated ack, socket delivery, owner renewal, and safe removal. Record public wallet roles, creation hashes, entity keys, chain blocks, expirations, and synthetic-only screenshots in evidence.md. Encryption tests must include two recipients, wrong key, modified ciphertext/AAD, and missing keys. Test offline queue/reconnect and absence of plaintext in explorer. Record observed failures and successful surfaces as they occur.

## Sources and verification

- [Official challenge agent instructions](https://raw.githubusercontent.com/Arkiv-Network/global-tour-stop-pre-devcon/main/AGENTS.md)
- [Rules](https://raw.githubusercontent.com/Arkiv-Network/global-tour-stop-pre-devcon/main/RULES.md)
- [Rubric](https://raw.githubusercontent.com/Arkiv-Network/global-tour-stop-pre-devcon/main/docs/scoring-rubric.md)
- [Submission checklist](https://raw.githubusercontent.com/Arkiv-Network/global-tour-stop-pre-devcon/main/docs/submission-checklist.md)
- [SDK installation](https://docs.arkiv.network/start-here/installation/)
- [Queries](https://docs.arkiv.network/typescript-sdk/querying-data/)
- [Mutations](https://docs.arkiv.network/typescript-sdk/mutating-data/)
- [Events](https://docs.arkiv.network/typescript-sdk/live-events/)
- Installed SDK source/declarations and viem watchEvent implementation, readable in node_modules after npm ci.

## Implementation notes after approval

src/crypto.js implements envelope encryption; tests cover two recipients, wrong keys, metadata/ciphertext/wrapper tampering. src/domain.js enforces immutable creator trust, flags, and schema. src/arkiv.js implements Q1–Q3 with real SDK calls, pagination, event hydration, renewal, deletion, and trusted key/ack writes. The numeric filtered query and Q4 above are reproducible examples; the UI filters its complete small zone snapshot in the browser. No claim of additional server range-filter usage is made.

src/practice.js is an isolated, explicitly labelled local adapter and creates no transactions. Browser signing keys stay in memory; responder private keys are non-extractable CryptoKeys stored by IndexedDB structured clone. PWA app shell and ciphertext outbox are implemented; an open page and funded signer are required on reconnect. Browser verification is recorded in evidence.md.

The production allow-list is empty until real public org addresses are configured with scripts/configure-responders.mjs. No private-key input exists. Optional injected-wallet signing supports faucet flows that fund only their connected wallet. Live network behavior is not claimed verified merely because code and local tests exist.


## Naming note (2026-10-18)
Attribute names are lowercase snake_case (`posted_at`, `pubkey_id`, `signal_key`, `acked_at`). The first live write with camelCase names reverted; see friction.md #8. JSON envelope fields inside the encrypted payload keep their camelCase names; they are not Arkiv attributes.
