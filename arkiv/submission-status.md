# Gate status — 17 October 2026

Public no-login deployment (Cloudflare Worker): https://veil.derbylabs.workers.dev. Its default walkthrough is local; Tiramisu mode reads the real chain through a same-origin /rpc gateway.

- [x] Public working Tiramisu-connected deployment: https://veil.derbylabs.workers.dev (Worker + /rpc gateway; live read of real signal and WebSocket event verified on the deployed URL).
- [x] Public MIT repository: https://github.com/0xderby/veil-arkiv
- [x] schema.md approved before UI implementation.
- [x] friction.md with versions, observed expected/actual behavior, and repros.
- [x] Real creator wallets/roles: reporter 0xc788…Aa67, responder org 0x2d1a…DDF8 (see evidence.md).
- [x] Creation hashes and exact successful reproduction: bootstrap run passed 2026-10-18; hashes in evidence.md.
- [x] Actual WebSocket delivery without refresh: board changed Awaiting response to Acknowledged live after a CLI ack (evidence.md, browser flow).
- [x] Evidence surviving expiration: hashes and entity keys saved in arkiv/transactions.json and evidence.md.
- [ ] <=3-minute video: timed script ready; recording pending.
- [ ] Required Devfolio answers and Privacy track: draft ready; declarations and submission pending.
- [x] Core code written during build window: 17 October in this project; builder must confirm final reuse/declaration.
- [ ] All judge links checked without login; deployment retained through 23 October.

Deadline: 18 October 2026, 23:59 London/Lagos. Do not rewrite history after deadline. Local examples and tests do not replace live Arkiv evidence.
