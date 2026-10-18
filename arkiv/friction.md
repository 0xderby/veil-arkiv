# Veil — Arkiv friction log

Started 17 October 2026 during source and schema verification. Observed results only. Planned functionality is in schema.md; pending tests are not successes or product defects.

Rig: Windows / PowerShell, Node 24.18.0, npm 11.16.0, Arkiv SDK 0.8.1, viem 2.57.7. Exact dependency graph: package-lock.json.

## 1. Package installation — environment limitation, recovered

- Surface: npm delivery of TypeScript SDK.
- Expected: download SDK 0.8.x and inspect installed types.
- Actual: restricted attempt failed with `ENOTFOUND registry.npmjs.org`. A permitted network attempt installed SDK 0.8.1 and viem 2.57.7 successfully.
- Reproduction: `npm install --save-exact @arkiv-network/sdk@0.8 viem --fetch-retries=0 --fetch-timeout=20000 --cache .npm-cache` in the restricted tool environment.
- Assessment: environment DNS/network restriction, not an Arkiv SDK bug. No user secrets involved. Recovery: permitted dependency download.

## 2. Query system timestamp discrepancy

- Surface: challenge AGENTS.md, query docs, installed query expressions.
- Expected: the suggested `$createdAt` range filter is accepted.
- Actual: installed validator rejects `$createdAt`; current query documentation lists it as result-only. The proposed schema uses its own numeric postedAt attribute.
- Reproduction: `npm ci`, then `npm run verify:sdk`; its rejection assertion executes `client.select().where(gte('$createdAt', u64(1)))` without a network request.
- Fix suggestion: align the challenge example with current indexed system attributes; show explicit numeric timestamp attributes.
- Query rendering, creator/owner filters, typed timestamps, and expiration helper checks passed offline. Live execution remains separate.

## 3. Event transport documentation clarity

- Surface: live-events guide, WatchEntityEventsParameters, SDK delegation, viem watchEvent.
- Expected: clear guidance for a real socket and zone filtering.
- Actual: guide presents an HTTP watcher and polling language. Installed SDK has no zone/type filter argument. Installed viem chooses subscription for WebSocket without fromBlock.
- Reproduction: inspect `@arkiv-network/sdk/src/actions/public/watchEntityEvents.ts` and `viem/actions/public/watchEvent.ts` after `npm ci`.
- Adaptation: explicit WS client, omit fromBlock, hydrate event keys and filter locally; disclose chain-wide event delivery. Actual socket delivery is not yet tested.
- Fix suggestion: add a WebSocket example and explicit filtering/expiration-event limitations to the guide.

## 4. Tiramisu public HTTP probe — unresolved

- Surface: public HTTP RPC via installed SDK.
- Expected: getChainId returns 7738577, then the namespaced synthetic-zone signal query returns a page (possibly empty).
- Actual: initial restricted/permitted attempts failed with `HTTP request failed` before chain-ID verification. A diagnostic rerun verified chain ID 7738577, then the signal query failed with `HTTP request failed`; no nested cause was available on that SDK error. No wallets or writes used. Query service behavior remains unverified; no general outage conclusion is justified.
- Reproduction: `npm ci`, then `npm run verify:rpc` using the uncredentialed official endpoint. Request timeout 10 seconds; retries disabled. Additional underlying cause is printed if available.
- Follow-up after schema approval: a direct arkiv_query request returned HTTP 429 with body `{"error":"ANON_COST_LIMITED","message":"unauthenticated query budget exhausted; get an API key at https://hub.arkiv.network for a monthly quota"}`. No secret URL/header was used. This identifies exhausted anonymous query quota for that request, not a general outage.
- Raw reproduction: POST the public endpoint with JSON `{"jsonrpc":"2.0","id":1,"method":"arkiv_query","params":["type = str('veil:v1:signal')",{"limit":"0x1","select":{"key":true}}]}` and Content-Type application/json. Obtain quota via official Hub key; keep it server-side/CLI env, never in a browser bundle.
- Improvement: preserve actionable HTTP status/body diagnostics in the SDK's short error so builders distinguish quota exhaustion from DNS/TLS errors.

## 5. Cryptography/domain acceptance — successful local tests

- Surface: browser-facing envelope implementation and installed typed SDK contract (Node WebCrypto rig).
- Expected: recipient-only decryption; immutable-creator trust; strictly later owner lease targets.
- Actual: 19 tests pass, including two recipients, wrong/spoofed key, tampered ciphertext/AAD/wrapper, rejected extra attributes, forged ack/key publisher, and readonly/expiry checks. No chain writes performed.
- Reproduction: `npm ci`, `npm test`, `npm run verify:sdk`, `npm run build`.
- Limit: Node tests and a successful bundle do not verify wallet funding, real chain behavior, browser storage, or socket delivery.

## 6. Local preview — environment limitation

- Surface: local development server and in-app browser preview.
- Expected: localhost:4173 serves the built app and browser can open it.
- Actual: server reported listening; both local fetch and in-app browser timed out. A second bind attempt correctly returned EADDRINUSE. No application defect is inferred from inaccessible loopback alone.
- Reproduction: `npm run build`, `npm run dev`, open http://127.0.0.1:4173. Deployed browser QA is pending.

## Surfaces not yet exercised

Faucet/Hub, block/data explorer inspection, signed entity creation/read-back, on-chain creator filtering, pagination across real pages, extension/equal-target revert, delete, real WS delivery/reconnect, key publication, PWA/offline sync, deployment. Add expected/actual, exact versions, queries, transaction evidence, and reproduction steps when tested.

## 7. Deployment and deployed browser checks

- Surface: Sites static packaging/deployment and deployed browser runtime; separate from Arkiv chain acceptance.
- Expected: source push, archive, no-login deployment, browser encryption and interaction checks.
- Actual: source push succeeded; default packager failed because Windows backslash paths were passed to Bash. The unchanged build was staged with the official prepare-site-build.cjs validator and archived with Windows tar; public deployment succeeded. Source commit/packaged output were matched before saving. GitHub publication is separately pending by builder instruction.
- Browser results: local encrypted post/decrypt, ciphertext inspector, acknowledgement, 6h-to-24h renewal, removal, mobile fit, saved responder-key count across reload, and temporary-wallet funding address all passed. These are not on-chain writes. 26 local tests pass after adapter/storage validation fixes. fake-indexeddb is test-only; actual offline transmission is still unverified.
- Arkiv browser result: the live board showed quota failure, and a real chain-wide WebSocket callback was observed. No Veil creation event or reconnect test has been verified. Key/ack publication, funded writes, real expiration, and offline transmission remain pending.
- Reproduction: open the public app in Local walkthrough; follow README steps. Switch to Tiramisu for the actual quota state. Generate a responder key, reload, and inspect the saved-key count. Use 390×844 requested viewport for mobile checks. See verification.md for exact scope.

## 8. Attribute-name revert: SDK message lists uppercase as valid, engine rejected it

- Surface: createEntity on Tiramisu via SDK 0.8.1 (revert decoding in node_modules/@arkiv-network/sdk/src/utils/revert.ts).
- Expected: attribute names may use "A"-"Z", "a"-"z", "0"-"9", ".", "-", "_" with a letter first, per the SDK's own error text.
- Actual: the first live write (a responder-key entity with an attribute named pubkeyId) reverted: "an attribute name holds "I" (0x49) at byte 6, which is outside the name charset ("A"-"Z", "a"-"z", ...)". The message lists A-Z as allowed while rejecting a capital I. After renaming all four camelCase attributes to snake_case (pubkey_id, posted_at, signal_key, acked_at) the whole flow passed. I did not isolate whether every capital letter is rejected; the observed fact is that the engine rejected a capital the message calls valid.
- Reproduction: createEntity with attributes: { pubkeyId: str('x') } on Tiramisu; then the same call with pubkey_id.
- Fix suggestion: make the SDK message and docs say lowercase only, or make the engine accept the documented charset; validate names client-side before a transaction is sent. Offline tests and verify:sdk could not catch this because it needs the engine.

## 9. Anonymous query budget exhausted by ordinary browser use

- Surface: public RPC arkiv_query, anonymous, from the browser app (SDK 0.8.1).
- Expected: a board that reads one zone's signals, responders and acks works for a normal session.
- Actual: during one test session the anonymous budget ran out (HTTP 429 ANON_COST_LIMITED), so the post form failed at its responder-key refresh query. The same app worked as soon as requests went through a gateway holding a Hub access key (HTTP 200).
- Reproduction: open the app in Tiramisu mode, post a signal, repeat a few times within the hour.
- Fix suggestion: a documented browser-safe path (scoped read-only key or per-origin quota), and a Retry-After style hint in the 429 body.
- Adaptation: scripts/serve.mjs /rpc gateway; keyless default builds; BAKE_KEY=1 opt-in for hosts without a server.

## 10. Browser flow observations (all passed)

- A browser-generated non-extractable P-256 key can be published by an allow-listed org wallet using only its public JWK, then used to decrypt a real chain signal (evidence.md).
- A temporary browser wallet loses its signing key on reload, so entities it owns can no longer be renewed or deleted after a refresh. This is documented in the app; plan for it in demos.
- On Windows with Node 24.18, one scripts/org.mjs run died at exit with a libuv assertion (srcwinasync.c) before recording its transaction; an immediate rerun succeeded. No entity was created by the failed run.
