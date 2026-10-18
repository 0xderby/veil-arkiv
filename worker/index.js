// Serves the static app (ASSETS) and a same-origin /rpc gateway that adds the Arkiv Hub access key
// (Worker secret ARKIV_ACCESS_KEY) so the key never reaches the browser.
const UPSTREAM = 'https://rpc.tiramisu.db-chain.testnet.arkiv.network';
const ALLOWED = new Set([
  'eth_chainId', 'eth_blockNumber', 'eth_getBalance', 'eth_getTransactionCount', 'eth_gasPrice', 'eth_maxPriorityFeePerGas',
  'eth_estimateGas', 'eth_feeHistory', 'eth_sendRawTransaction', 'eth_getTransactionReceipt', 'eth_getTransactionByHash',
  'eth_getBlockByNumber', 'eth_call', 'net_version', 'web3_clientVersion',
]);
const allowedMethod = m => typeof m === 'string' && (ALLOWED.has(m) || m.startsWith('arkiv_'));
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function rpc(request, env) {
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return json({ error: 'origin not allowed' }, 403);
  const text = await request.text();
  if (text.length > 200_000) return json({ error: 'payload too large' }, 413);
  let body;
  try { body = JSON.parse(text); } catch { return json({ error: 'invalid json' }, 400); }
  const calls = Array.isArray(body) ? body : [body];
  if (calls.length === 0 || calls.length > 20 || !calls.every(c => c && allowedMethod(c.method))) return json({ error: 'method not allowed' }, 403);
  const headers = { 'content-type': 'application/json' };
  if (env.ARKIV_ACCESS_KEY) headers['X-API-KEY'] = env.ARKIV_ACCESS_KEY;
  try {
    const upstream = await fetch(UPSTREAM, { method: 'POST', headers, body: text });
    return new Response(upstream.body, { status: upstream.status, headers: { 'content-type': 'application/json' } });
  } catch { return json({ error: 'upstream unreachable' }, 502); }
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/rpc') return request.method === 'POST' ? rpc(request, env) : json({ error: 'POST only' }, 405);
    return env.ASSETS.fetch(request);
  },
};
