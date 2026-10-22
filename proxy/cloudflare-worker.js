/**
 * Minimal CurseForge API proxy for Modpacker (Cloudflare Workers).
 *
 * The CurseForge Core API needs an `x-api-key` header. Shipping that key in a static
 * site exposes it to every visitor, so in production the browser talks to this worker
 * instead; the worker adds the key server-side and returns CORS headers.
 *
 * Deploy:
 *   npx wrangler deploy proxy/cloudflare-worker.js --name modpacker-cf-proxy --compatibility-date 2025-01-01
 *   npx wrangler secret put CURSEFORGE_API_KEY --name modpacker-cf-proxy
 *   # optional, comma separated; defaults to "*"
 *   npx wrangler secret put ALLOWED_ORIGINS --name modpacker-cf-proxy
 *
 * Then build the site with VITE_CURSEFORGE_PROXY_URL=https://modpacker-cf-proxy.<you>.workers.dev
 * (or paste that URL into the app's Settings dialog).
 */

const UPSTREAM = 'https://api.curseforge.com';

/** Only the endpoints Modpacker uses are forwarded. */
const ALLOWED_ROUTES = [
  { method: 'GET', pattern: /^\/v1\/mods\/search$/ },
  { method: 'POST', pattern: /^\/v1\/mods$/ },
  { method: 'GET', pattern: /^\/v1\/mods\/\d+$/ },
  { method: 'GET', pattern: /^\/v1\/mods\/\d+\/files$/ },
  { method: 'GET', pattern: /^\/v1\/mods\/\d+\/files\/\d+$/ },
  { method: 'POST', pattern: /^\/v1\/fingerprints\/432$/ },
];

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export default {
  async fetch(request, env) {
    const requestOrigin = request.headers.get('Origin') ?? '';
    const allowed = (env.ALLOWED_ORIGINS ?? '*').split(',').map((o) => o.trim());
    const origin = allowed.includes('*') ? '*' : allowed.includes(requestOrigin) ? requestOrigin : null;

    if (!origin) return new Response('Origin not allowed', { status: 403 });
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
    const route = ALLOWED_ROUTES.find((r) => r.method === request.method && r.pattern.test(url.pathname));
    if (!route) return new Response('Not found', { status: 404, headers: cors });

    if (!env.CURSEFORGE_API_KEY) {
      return new Response('Proxy is missing the CURSEFORGE_API_KEY secret', { status: 500, headers: cors });
    }

    const upstream = await fetch(`${UPSTREAM}${url.pathname}${url.search}`, {
      method: request.method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'x-api-key': env.CURSEFORGE_API_KEY,
      },
      body: request.method === 'POST' ? await request.text() : undefined,
    });

    const headers = new Headers(cors);
    headers.set('Content-Type', upstream.headers.get('Content-Type') ?? 'application/json');
    if (request.method === 'GET' && upstream.ok) headers.set('Cache-Control', 'public, max-age=300');
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
