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

Not yet observed on chain: delete ("I'm safe"), live WebSocket delivery of a Veil entity in the browser, the browser decrypting a chain signal, and expiry of an entity.
