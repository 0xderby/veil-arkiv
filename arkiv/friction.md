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
