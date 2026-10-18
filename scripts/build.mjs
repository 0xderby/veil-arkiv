import { build } from 'esbuild';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
// Default builds are keyless and safe to publish. BAKE_KEY=1 embeds ARKIV_ACCESS_KEY (visible to visitors) for a keyed deploy or local test.
const bakedKey = process.env.BAKE_KEY === '1' ? (process.env.ARKIV_ACCESS_KEY ?? '') : '';
await mkdir('dist', { recursive: true });
await cp('public', 'dist', { recursive: true });
const result = await build({ entryPoints: ['src/app.js'], bundle: true, minify: true, format: 'esm', target: ['es2022'], outfile: 'dist/app.js', metafile: true, external: ['/img/*'], logLevel: 'warning', define: { 'process.env.NODE_ENV': '"production"', __ARKIV_KEY__: JSON.stringify(bakedKey), __ARKIV_PROXY__: process.env.RPC_PROXY === "1" ? "true" : "false" } });
const app = await readFile('dist/app.js', 'utf8');
if (/PRIVATE_KEY=0x[0-9a-f]{64}/i.test(app)) throw new Error('Secret-shaped value in build.');
await writeFile('dist/_headers', '/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  Permissions-Policy: geolocation=(), microphone=(), camera=()\n  Content-Security-Policy: default-src \'self\'; script-src \'self\'; style-src \'self\' https://fonts.googleapis.com; font-src \'self\' https://fonts.gstatic.com; connect-src \'self\' https://rpc.tiramisu.db-chain.testnet.arkiv.network wss://rpc.tiramisu.db-chain.testnet.arkiv.network; img-src \'self\' data:; object-src \'none\'; base-uri \'self\'; frame-ancestors \'none\'\n');
if (!bakedKey && process.env.ARKIV_ACCESS_KEY && app.includes(process.env.ARKIV_ACCESS_KEY)) throw new Error('Access key leaked into a keyless build.');
console.log(`${bakedKey ? 'KEYED build (key visible in bundle). ' : ''}Built static app: ${Math.round(result.metafile.outputs['dist/app.js'].bytes / 1024)} KiB JS.`);
