# Devfolio draft — not submitted

Do not submit unchanged. Brackets require real evidence, links, or builder declarations. Code presence is distinct from verified on-chain behavior.

**Name:** Veil. **Tagline:** Private signals. Shared response. **Track:** Privacy (Global).

**Problem:** Public exact locations and identifying emergency details can expose vulnerable people to surveillance, harassment, or targeting. Veil demonstrates shared coarse discovery with exact fictional position/details encrypted separately for approved responders. All examples are synthetic. It is not a rescue service or a total-shutdown solution.

**Challenges:** Direct anonymous query returned HTTP 429 ANON_COST_LIMITED. SDK 0.8.1 rejects the suggested `$createdAt` predicate, so explicit numeric postedAt is used. The event wrapper has no zone filter: WS with no fromBlock plus local hydration/filtering is required. See friction.md for exact versions and repros. Live acceptance still awaits working quota and funded wallets.

1. **Live URL:** [verified deployment URL; check no-login access].
2. **Indian nationality:** [builder answers; Privacy Global has no nationality requirement].
3. **Why Arkiv:** independent responders query shared ciphertext and verify immutable acknowledgement creators without our database API. Postgres/own API puts availability under an operator; IPFS needs discovery/live-lease indexing; a subgraph needs another write source. Exact plaintext and secret keys stay local. Similar workflows are possible elsewhere with different infrastructure/trust.
4. **How Arkiv:** [public links to src/arkiv.js, src/domain.js, src/crypto.js]. Namespaced typed attributes, encrypted payloads, createdBy trust, per-type expiration, readonly fields, owner renewal/removal, and event-driven hydration. [Add specific observed transactions/events for every claimed live feature.]
5. **Friction:** [public GitHub /arkiv/friction.md].
6. **Creator wallets:** [real reporter and org addresses/roles; none configured yet].
7. **Schema:** [public GitHub /arkiv/schema.md].
8. **Reproduction:** follow README/setup and exact schema queries using configured real public org addresses. Browser flow covers public key, ciphertext, ack, events, renew/remove. CLI bootstrap records writes but retains no decryption key after exit. [Reproduce on a fresh machine before declaring success.]
9. **Reuse:** app/integration created 17 October in initially empty project directory. Third-party libraries: Arkiv SDK 0.8.1, viem 2.57.7, esbuild. [Builder discloses any other reuse with baseline SHA.]
10. **Surfaces:** SDK from JavaScript, Docs, Direct JSON-RPC diagnostic. WS implemented but live delivery unverified. Hub/Faucet/Explorer not yet exercised; update after actual testing.
11. **Other:** npm and browser WebCrypto, if relevant.
12. **Time to first entity:** [no entity yet; select actual elapsed-time option after success].
13. **LLMs:** OpenAI Codex; [builder adds others if any].
14. **Improve first:** expose actionable anonymous quota diagnostics in SDK errors and align query/system-field and WebSocket examples. Cite exact observed repro, not a general-outage claim.
15. **Feedback call:** [builder decides].
16. **Work/date declaration:** [builder confirms after reviewing history/reuse].
17. **Public MIT repo/all links accessible:** [not yet true; confirm after publication and no-login checks].
18. **Devcon attendance:** [builder decides; optional].

Required media: actual <=3-minute demo and project media. Do not infer eligibility, consent, personal answers, or transaction evidence. Never paste secrets into Devfolio.
