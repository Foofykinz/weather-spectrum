// Weather Spectrum GLM lightning Worker.
//
// Every minute (cron): find new GOES-19/18 GLM Level 2 files on NOAA's public
// AWS buckets, extract good-quality flash locations over North America, and
// keep the last 15 minutes in ONE R2 object. Writing a single object per run
// (and none when nothing is new) keeps R2 writes to roughly 43,000 a month.
//
// Browsers get three views of that object, all cached at Cloudflare's edge:
//   GET /window.json             everything in the last 15 minutes (first load)
//   GET /index.json              list of 20-second chunks, without flashes (poll every 20 s)
//   GET /chunks/g19/<end>.json   one chunk's flashes (immutable once published)
// Flash format: [lat, lon, secondsAfterChunkStart].
//
// GOES-East (G19) supplies flashes east of 110°W and GOES-West (G18) west of it,
// so overlapping coverage never produces duplicate markers.

import { extractFlashes, fileTimes } from './glm.js';

const SATS = ['19', '18'];
const WINDOW_MS = 15 * 60 * 1000;
// Catch-up limit per satellite per run: after a missed run or outage we
// backfill at most 3 minutes; older gaps simply show as gaps.
const MAX_FILES_PER_RUN = 9;
const STORE_KEY = 'window.json';

const pad = (n, w = 2) => String(n).padStart(w, '0');
function hourPrefix(d) {
  const doy = Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000) + 1;
  return `GLM-L2-LCFA/${d.getUTCFullYear()}/${pad(doy, 3)}/${pad(d.getUTCHours())}/`;
}

async function listRecent(sat, now) {
  const keys = [];
  for (const d of [new Date(now - 3600e3), new Date(now)]) {
    const res = await fetch(`https://noaa-goes${sat}.s3.amazonaws.com/?list-type=2&prefix=${hourPrefix(d)}`);
    if (!res.ok) throw new Error(`GOES-${sat} listing returned ${res.status}`);
    for (const m of (await res.text()).matchAll(/<Key>([^<]+)<\/Key>/g)) keys.push(m[1]);
  }
  return keys.sort();
}

async function loadStore(env) {
  const obj = await env.GLM.get(STORE_KEY);
  const s = obj ? await obj.json() : null;
  return { chunks: s?.chunks || [], last: s?.last || {}, latency: s?.latency || [] };
}

async function run(env) {
  const now = Date.now();
  const store = await loadStore(env);
  const errors = [];
  let added = 0;

  for (const sat of SATS) {
    try {
      const keys = await listRecent(sat, now);
      const fresh = keys
        .map((key) => ({ key, ...fileTimes(key) }))
        .filter((k) => k.end && k.end.getTime() > now - WINDOW_MS && (!store.last[sat] || k.end.getTime() > store.last[sat]))
        .slice(-MAX_FILES_PER_RUN);
      const have = new Set(store.chunks.map((c) => c.path));
      for (const f of fresh) {
        if (have.has(`chunks/g${sat}/${f.end.getTime()}.json`)) continue; // never duplicate a period
        const res = await fetch(`https://noaa-goes${sat}.s3.amazonaws.com/${f.key}`);
        if (!res.ok) throw new Error(`GOES-${sat} file returned ${res.status}`);
        const flashes = extractFlashes(await res.arrayBuffer(), sat, f.start, f.end);
        store.chunks.push({ path: `chunks/g${sat}/${f.end.getTime()}.json`, sat: `G${sat}`, start: f.start.toISOString(), end: f.end.toISOString(), flashes });
        store.last[sat] = f.end.getTime();
        // Seconds from the end of the 20-second observation period until it was processed here.
        store.latency.push({ sat: `G${sat}`, end: f.end.toISOString(), processedSec: Math.round((Date.now() - f.end.getTime()) / 1000) });
        added++;
      }
    } catch (err) {
      errors.push(`G${sat}: ${err.message}`);
    }
  }

  const before = store.chunks.length;
  store.chunks = store.chunks.filter((c) => Date.parse(c.end) > now - WINDOW_MS).sort((a, b) => a.end.localeCompare(b.end));
  const expired = before !== store.chunks.length;

  // Nothing new and nothing expired: skip the write entirely.
  if (!added && !expired && !errors.length) return { written: false };

  store.latency = store.latency.slice(-60);
  await env.GLM.put(STORE_KEY, JSON.stringify({ generated: new Date().toISOString(), windowMinutes: 15, errors, ...store }), {
    httpMetadata: { contentType: 'application/json' },
  });
  return { written: true, added, errors };
}

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
const json = (body, cacheControl, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': cacheControl } });

async function respond(key, env) {
  const obj = await env.GLM.get(STORE_KEY);
  if (!obj) return json({ error: 'No lightning data yet.' }, 'no-store', 503);
  const s = await obj.json();
  const meta = { generated: s.generated, windowMinutes: s.windowMinutes, errors: s.errors || [] };
  if (key === 'window.json') {
    return json({ ...meta, chunks: s.chunks.map(({ path, sat, start, end, flashes }) => ({ path, sat, start, end, flashes })) }, 'public, max-age=10');
  }
  if (key === 'index.json') {
    return json({ ...meta, chunks: s.chunks.map(({ flashes, ...c }) => ({ ...c, n: flashes.length })) }, 'public, max-age=10');
  }
  if (key === 'status.json') {
    return json({ ...meta, last: s.last, latency: s.latency.slice(-12) }, 'no-store');
  }
  const chunk = s.chunks.find((c) => c.path === key);
  return chunk ? json(chunk, 'public, max-age=86400, immutable') : json({ error: 'Expired or unknown chunk.' }, 'public, max-age=60', 404);
}

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(run(env));
  },

  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: CORS });
    const key = new URL(request.url).pathname.replace(/^\/+/, '');
    if (!['index.json', 'window.json', 'status.json'].includes(key) && !/^chunks\/g1[89]\/\d+\.json$/.test(key)) {
      return new Response('Not found', { status: 404, headers: CORS });
    }
    // Serve from Cloudflare's edge cache when possible, so most requests never touch R2.
    const cache = caches.default;
    const cached = await cache.match(request);
    if (cached) return cached;
    const res = await respond(key, env);
    if (res.ok && !res.headers.get('Cache-Control').includes('no-store')) ctx.waitUntil(cache.put(request, res.clone()));
    return res;
  },
};
