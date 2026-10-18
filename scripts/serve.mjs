import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..', 'dist');
const types = { '.jpg': 'image/jpeg', '.webp': 'image/webp', '.png': 'image/png', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
// Dev-only RPC gateway: the Hub access key stays in this process (env) and is never sent to the browser.
const RPC = 'https://rpc.tiramisu.db-chain.testnet.arkiv.network';
async function proxyRpc(req, res) {
  const chunks = []; for await (const c of req) chunks.push(c);
  const headers = { 'content-type': 'application/json' }; if (process.env.ARKIV_ACCESS_KEY) headers['X-API-KEY'] = process.env.ARKIV_ACCESS_KEY;
  try { const r = await fetch(RPC, { method: 'POST', headers, body: Buffer.concat(chunks) }); res.writeHead(r.status, { 'content-type': 'application/json' }).end(Buffer.from(await r.arrayBuffer())); }
  catch { res.writeHead(502).end('{"error":"upstream unreachable"}'); }
}
createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/rpc') return proxyRpc(req, res);
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try { const data = await readFile(file); res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' }).end(data); }
  catch { res.writeHead(404).end('Not found'); }
}).listen(4173, '127.0.0.1', () => console.log('Local: http://127.0.0.1:4173'));
