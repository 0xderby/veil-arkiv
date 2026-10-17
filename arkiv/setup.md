# Setup handoff

No private-key field exists in the app. Never send a secret to chat.

1. Run `npm ci`, `npm run build`, `npm run dev`; open localhost:4173. The default walkthrough makes no chain writes.
2. Generate/use a responder throwaway wallet. Configure only its PUBLIC address with `node scripts/configure-responders.mjs <address>`. Rebuild/redeploy. The empty deployed allow-list blocks posting until configured.
3. Use Arkiv Hub to obtain test GLM. Browser wallets expose only the funding address. If the faucet cannot fund arbitrary addresses, use an injected wallet or transfer test GLM from its funded address. No real assets.
4. Direct public query returned HTTP 429 ANON_COST_LIMITED. Official Hub access-key setup requires wallet sign-in, potentially registration, and captcha. Keep the key server-side or in CLI env only. This static app includes no RPC gateway and embeds no key; public live-query reliability remains unresolved.
5. On the responder device connect the allow-listed wallet, generate a local encryption key, and publish its public half. Record org address/role and transaction. Keep this browser's storage for decryption.
6. On the reporter device fund a different temporary wallet and post a fictional scenario. On the responder device, observe the live event, decrypt, and acknowledge. Inspect the actual explorer record; renew/remove from the owner session.
7. Export successful session evidence before reload. Record real wallet roles, hashes, entity keys, and expiration. Record a video <=3 minutes.
8. Public GitHub publication is pending at the builder's request. Authenticate gh privately when ready, then publish the existing history as a public MIT repo. Do not rewrite history.

CLI alternative: set REPORTER_PRIVATE_KEY, RESPONDER_PRIVATE_KEY, and optional ARKIV_ACCESS_KEY privately in the terminal environment, configure the responder's public address, and run `npm run bootstrap`. This has not run against funded wallets. It records each successful write before proceeding. No live result is claimed until observed.
