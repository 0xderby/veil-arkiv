// RPC endpoints. A Hub access key is baked in ONLY when the build is run with BAKE_KEY=1 (see scripts/build.mjs);
// a baked key is visible to every visitor, so keep it origin-restricted in the Hub and never commit it.
import { CONFIG } from './config.js';
const key = typeof __ARKIV_KEY__ === 'string' ? __ARKIV_KEY__ : '';
// A same-origin /rpc proxy (scripts/serve.mjs, or a Worker in production) can hold the key server-side instead.
const proxy = typeof __ARKIV_PROXY__ === 'boolean' && __ARKIV_PROXY__ && typeof location !== 'undefined' ? `${location.origin}/rpc` : '';
export const RPC_HTTP = proxy || (key ? `${CONFIG.http}/${key}` : CONFIG.http);
export const RPC_WS = key ? `${CONFIG.ws}/${key}` : CONFIG.ws;
export const redact = text => key ? String(text).split(key).join('[access key]') : String(text);
export const keyed = Boolean(key) || Boolean(proxy);
