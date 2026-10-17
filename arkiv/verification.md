# Verification record — 17 October 2026

Stage: implementation after schema approval. UI, encryption, live SDK adapter, local walkthrough, wallet setup, offline outbox, and build are implemented. No signed chain write, funded wallet, or video exists yet. Public deployment is being prepared. Sources were read during this session; API presence is distinct from observed network behavior. Earlier verification entries below document the initial stage; current results follow.

## Implementation verification after approval

- `npm test`: 19 tests pass. Two recipients independently decrypt; unlisted/wrong private keys fail; modified ciphertext, context, recipient identities, and wrappers fail; private responder key export fails; absent/duplicate recipients fail closed; no plaintext detail/position appears in envelope. Domain tests reject forged creator, extra public attributes, expired/patchable entities, and equal/earlier lease targets; local lifecycle and sorting pass.
- `npm run build`: production static bundle succeeds (approximately 409 KiB minified JavaScript before transfer compression).
- Direct public arkiv_query diagnostic returned HTTP 429 with `ANON_COST_LIMITED` and message `unauthenticated query budget exhausted; get an API key at https://hub.arkiv.network for a monthly quota`. This explains the observed SDK error for that request. It does not establish a general chain outage.
- `node scripts/bootstrap.mjs` with no credentials correctly refused before any write. The real acceptance script is unexecuted against funded wallets.
- Local HTTP server started, but fetch and in-app browser access to its loopback port timed out in this tool environment. Browser QA will use deployed output if reachable. No local screenshot/interaction success is claimed.
- GitHub CLI saved authentication is invalid. Builder explicitly chose to leave public GitHub publication pending.
- No signed testnet transactions, real allow-listed wallets, faucet/Hub interaction, or actual socket delivery have been observed yet.

## Confirmed from primary challenge sources

Read the canonical [AGENTS.md](https://raw.githubusercontent.com/Arkiv-Network/global-tour-stop-pre-devcon/main/AGENTS.md), [rules](https://raw.githubusercontent.com/Arkiv-Network/global-tour-stop-pre-devcon/main/RULES.md), [rubric](https://raw.githubusercontent.com/Arkiv-Network/global-tour-stop-pre-devcon/main/docs/scoring-rubric.md), and [checklist](https://raw.githubusercontent.com/Arkiv-Network/global-tour-stop-pre-devcon/main/docs/submission-checklist.md).

The challenge closes 18 October 2026 at 23:59 London (22:59 UTC; 23:59 Lagos). The local date is already 17 October, so the proposed three-day build plan must be compressed. Deployment must stay accessible through 23 October. Mandatory submission materials include a public working app, reproducible queries, public MIT source, schema, friction report, creator wallet roles, video no longer than three minutes, track selection, completed form, and disclosed reused work. The frozen deadline commit is judged; do not rewrite history afterwards.

Privacy scoring examines public exposure, metadata restraint, encryption, and user-controlled expiration. Four criteria each contribute 25 points. Detailed scoring and all form questions remain in the linked canonical documents; no gate is claimed complete here.

## Installed versions and environment

- Windows / PowerShell; Node v24.18.0; npm 11.16.0.
- `@arkiv-network/sdk` 0.8.1; `viem` 2.57.7 (exact pins and package-lock.json).
- `npm ls --depth=0` passed. Installation audit reported zero vulnerabilities at installation time; this is not a security assessment.

## Inspected installed types and implementation

All paths below are relative to node_modules and remain reproducible with `npm ci`:

| Surface | Installed evidence | Finding |
| --- | --- | --- |
| Network | `@arkiv-network/sdk/src/chains/tiramisu.ts` | ID 7738577; supplied HTTP/WS URLs; GLM gas token |
| Queries | `@arkiv-network/sdk/src/query/queryBuilder.ts`, `engine.ts`, `queryResult.ts`; `dist/index-Cq6fa8AI.d.ts` | select/where/limit/fetch, createdBy, ownedBy, cursor; 200 maximum; no orderBy; page traversal |
| Attribute types | `@arkiv-network/sdk/src/attr/values.ts`, `types.ts`; `dist/attr/index.d.ts` | Explicit typed constructors; bare number defaults to i32; millisecond timestamps need u64 |
| Predicates | `@arkiv-network/sdk/src/query/expression.ts` | Numeric range types; `$creator`/`$owner`/`$key`/`$expiresAt` queryable; `$createdAt` is result-only |
| Creation and mutations | `@arkiv-network/sdk/src/actions/wallet/{createEntity,extendEntity,patchEntity,deleteEntity}.ts`; `dist/index-DaNeJUw8.d.ts` | Creation takes payload bytes, attributes object, expires, flags; patch is partial with set/unset; delete exists |
| Creation flags | `@arkiv-network/sdk/src/entity/flags.ts`; `dist/index-BkqSnGJH.d.ts` | readonly and permissionlessExtension exist; readonly freezes attributes/payload, not extension/deletion/ownership |
| Expiration | `@arkiv-network/sdk/src/entity/expiry.ts`, `src/utils/expirationTime.ts`; `dist/expiry-BxOlvVWC.d.ts` | Branded Expiry via ExpirationTime; relative duration or absolute block; nominal two-second conversion; later-expiry requirement described in extendEntity |
| Entity watcher | `@arkiv-network/sdk/src/actions/public/watchEntityEvents.ts`; `dist/index-DaNeJUw8.d.ts` | Delegates to watchEvent with Arkiv operation address; callbacks, fromBlock, pollingInterval; no zone/type predicate parameter |
| Actual transport branch | `viem/actions/public/watchEvent.ts` | WebSocket without fromBlock selects subscription; HTTP/fromBlock selects polling |

## Executed checks

`npm run verify:sdk` passed. It imports the installed exports, renders five planned queries, checks network ID from chain configuration, u64 timestamp encoding, i32 overflow rejection, owner-only readonly flags, 48-hour block conversion, absolute expiration, cursor existence, absent orderBy, and rejection of a `$createdAt` predicate. It uses no credentials or chain writes. This is runtime API verification, not a TypeScript compilation or on-chain end-to-end test.

Rendered examples:

```text
type = str('veil:v1:signal') AND zone = str('s000')
type = str('veil:v1:signal') AND zone = str('s000') AND need = str('water') AND priority >= i32(2)
```

Creator and owner query output uses an explicitly marked placeholder public address. It is not a configured responder or evidence of participation.

Initial `npm run verify:rpc` attempts failed with `HTTP request failed` before chain-ID verification. One diagnostic rerun against the public endpoint successfully returned chain ID 7738577, then the namespaced Arkiv signal query failed with `HTTP request failed`. Live chain identity is verified; live Arkiv query execution remains unverified. The SDK error exposed no nested cause to the script. This does not establish a chain outage. See friction.md.

## Documentation discrepancies and adaptation

- Official challenge AGENTS.md suggests ranges on `$createdAt`, but the installed 0.8.1 expression validator and current [query guide](https://docs.arkiv.network/typescript-sdk/querying-data/) exclude that system field from predicates. Use `postedAt: u64`, filter that when needed, and sort in the client.
- The [live-events guide](https://docs.arkiv.network/typescript-sdk/live-events/) presents HTTP polling and does not explain the WebSocket branch. The installed SDK plus viem implementation supports the challenge's socket configuration; real socket delivery is still untested.
- The [mutation guide](https://docs.arkiv.network/typescript-sdk/mutating-data/) describes the expiration constraint as not earlier; installed extendEntity comments say expiry must move later, matching the challenge rule. Enforce strictly later, then verify the equal/earlier-target reverts on testnet before claiming that observation.
- Creation flags, patchEntity, and deleteEntity all exist. No invented private entity flag or server-side watcher zone filter is proposed.

## Still unverified / required next

Arkiv query execution on the public RPC; faucet and funded test wallets; wallet roles and real public allow-list; create/read-back transactions; crypto interoperability/tamper resistance; creator spoof rejection on-chain; true WS delivery/reconnect; actual expiry/renew/delete behavior; offline PWA queue; browser private-key lifecycle; explorer privacy inspection; hosting/CORS; public repository and MIT publication; video and form answers. Do not claim any of these implemented or working yet.
