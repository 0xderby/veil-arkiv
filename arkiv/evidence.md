# On-chain evidence — Tiramisu testnet (chain ID 7738577)

Run on 2026-10-18 with `node --env-file=.env scripts/bootstrap.mjs` (SDK 0.8.1, synthetic data only). Full machine-readable record: [transactions.json](transactions.json).

| Step | Wallet role | Wallet | Tx hash |
| --- | --- | --- | --- |
| Publish responder public key | Responder org | `0x2d1a32945456e61C8Ad77c3a0f54dD01d6d2DDF8` | [0x966fd2fb…1691c](https://tiramisu.explorer.arkiv.network/tx/0x966fd2fb2f33fd7411e34cdd176f7f0e703c14b8abe426f96f9064645df1691c) |
| Create encrypted signal | Reporter | `0xc788B78499b75762A02E9537380057cd7bc4Aa67` | [0x695bd754…ccea3](https://tiramisu.explorer.arkiv.network/tx/0x695bd7549b6784a91b77793fd8aa2b156bc362ff0665a49f138fd91497dccea3) |
| Acknowledge signal | Responder org | `0x2d1a…DDF8` | [0x5f30cff8…711c8](https://tiramisu.explorer.arkiv.network/tx/0x5f30cff88d94edd7dd71304984045ea4afc314740f3b04572706db075d1711c8) |
| Extend signal lease | Reporter (owner) | `0xc788…Aa67` | [0x1b7ab6c6…f5367](https://tiramisu.explorer.arkiv.network/tx/0x1b7ab6c6fdf62715367da722f68239fd7fcfffee16d84a63b534292737cf5367) |
| Re-acknowledge renewed lease | Responder org | `0x2d1a…DDF8` | [0x448a62ec…37f20](https://tiramisu.explorer.arkiv.network/tx/0x448a62ec76a09fd1d65248a489cf46167016dd8ee684f2f7e04a2df728a37f20) |

The script also read the signal back by key, decrypted it with the responder's private key (held in process memory only, not exported), and found it through a `$creator` plus zone query. Entity keys and expiry blocks are in transactions.json.

Funding: 10 test GLM was received by the reporter wallet, and 5 GLM was sent on to the responder wallet in transaction `0x5ad6113ce2c44237f6b26be661387788c23cfcf4fcc48da679db64c8c5db5145`.

## Browser flow (same day, localhost build, real Tiramisu)

A different path from the CLI run: a browser holds its own non-extractable responder key, and a temporary browser wallet posts and manages the signal.

| Step | Actor | Tx hash |
| --- | --- | --- |
| Publish the browser's PUBLIC responder key (private half stays in IndexedDB) | Responder org (CLI) | [0x1bf461b3…dfda3](https://tiramisu.explorer.arkiv.network/tx/0x1bf461b37ca2e67e9e9dd6c5f1281b14ff7e83f55d6dcd30d162db73ffadfda3) |
| Post encrypted signal from the browser | Temporary browser wallet `0x74BaD0b7851D6e4Ea01C6bF2E4Cf652Fc8496B15` | [0xfc9d15ba…f4b3e](https://tiramisu.explorer.arkiv.network/tx/0xfc9d15ba2341602eb12390f0034355a12e9872ffca3525893400ade69c2f4b3e) |
| Acknowledge it | Responder org (CLI) | [0x219b8b6c…e979f](https://tiramisu.explorer.arkiv.network/tx/0x219b8b6c16b0839501b3b81f3632bb879f8d1d51d04796129e96c43dbc0e979f) |
| Owner renews lease from the browser (block 829060 to 829099) | Temporary browser wallet | [0x8d9e556a…401b5](https://tiramisu.explorer.arkiv.network/tx/0x8d9e556aa962bf0c82545c7b01fb04b65396ae5588c7225b3c122f3b085401b5) |
| Owner removes the signal ("I'm safe") from the browser | Temporary browser wallet | [0x19482dd1…06590](https://tiramisu.explorer.arkiv.network/tx/0x19482dd1ebbaf872ede4726b2e4bd4053ad514695d3187eba4e511adb2806590) |

Observed in the browser: the signal decrypted on the device with the stored non-extractable key (fictional details and grid position shown); the board changed from Awaiting response to Acknowledged without a reload after the CLI acknowledgement (WebSocket entity event); after removal the entity key returned "No live entity" from getEntity. The temporary wallet's address was funded with test GLM from the reporter wallet (0.3 GLM, tx 0x3ad6177b…dc93).

Still not observed: entity expiry running out on its own, and an offline outbox submission.
