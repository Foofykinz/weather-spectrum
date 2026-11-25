// Save the archive data behind each event replay (warnings, storm detections,
// watch history and radar file lists) to public/replays/<slug>.json, so
// visitors get it from this site instead of from IEM, the NWS and the radar
// archive every time. The radar scans themselves still come from NOAA's
// open data on AWS.
//
// Run by hand after adding an event (or to refresh the saved copies):
//   npm run build && npx vite preview --port 4324
//   node scripts/record-replays.mjs [slug ...]
// Options (environment): BASE (default http://localhost:4324), CHROME (path to Chrome).
//
// How: opens each event page with ?record=1 in headless Chrome, plays each
// radar product once, and saves every archive response the page received
// (src/radar/savedData.js). Warning polygons far from the event are dropped
// to keep the files small.

import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Slug and map center of each event, read from src/seo/events.js.
const EVENTS = [...readFileSync('src/seo/events.js', 'utf8').matchAll(/slug: '([^']+)'[\s\S]*?view: \{ lat: (-?[\d.]+), lon: (-?[\d.]+)/g)].map((m) => ({
  slug: m[1],
  view: { lat: +m[2], lon: +m[3] },
}));

const BASE = process.env.BASE || 'http://localhost:4324';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9571;
const only = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), 'ws-record-'));
const chrome = spawn(CHROME, ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
let targets;
for (let i = 0; i < 80; i++) {
  try {
    targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
    if (targets.find((t) => t.type === 'page')) break;
  } catch {
    // Chrome still starting
  }
  await sleep(250);
}
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const x = JSON.parse(m.data);
  if (x.id && pending.has(x.id)) {
    pending.get(x.id)(x);
    pending.delete(x.id);
  }
};
const send = (method, params = {}) =>
  new Promise((r) => {
    const n = ++id;
    pending.set(n, r);
    ws.send(JSON.stringify({ id: n, method, params }));
  });
// Run a function in the page and return its (JSON) result.
const run = async (fn, ...args) => (await send('Runtime.evaluate', { expression: `(${fn})(...${JSON.stringify(args)})`, returnByValue: true, awaitPromise: true })).result?.result?.value;

// The replay's frame label reads "KTLX 7:32 PM CDT · 10/10" once the scans are in.
const framesShown = () => [...document.querySelectorAll('span')].some((s) => /^K\w{3} .* · \d+\/\d+$/.test(s.textContent.trim()));
const loadError = () => document.body.innerText.includes('couldn’t load');
async function waitForFrames(label) {
  for (let i = 0; i < 60; i++) {
    await sleep(2000);
    if (await run(loadError)) throw new Error(`${label}: the replay couldn't load`);
    if (await run(framesShown)) return;
  }
  throw new Error(`${label}: timed out`);
}

// Keep only warning polygons near the event (plus features without a
// geometry, such as watch messages, which are matched by zone).
function trim(text, e) {
  if (!text.trimStart().startsWith('{')) return text;
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    return text;
  }
  if (!Array.isArray(j.features)) return text;
  const { lat, lon } = e.view;
  const near = (f) => {
    if (!f.geometry) return true;
    const pts = JSON.stringify(f.geometry.coordinates).match(/-?\d+(\.\d+)?/g)?.map(Number) || [];
    for (let i = 0; i + 1 < pts.length; i += 2) if (Math.abs(pts[i] - lon) < 3.5 && Math.abs(pts[i + 1] - lat) < 2.5) return true;
    return false;
  };
  j.features = j.features.filter(near);
  return JSON.stringify(j);
}

await send('Runtime.enable');
await send('Page.enable');
await send('Page.navigate', { url: `${BASE}/about` });
await sleep(2000);
await run(() => localStorage.setItem('cookieConsent', 'declined'));
mkdirSync('public/replays', { recursive: true });

let failed = 0;
for (const e of EVENTS) {
  if (only.length && !only.includes(e.slug)) continue;
  try {
    await send('Page.navigate', { url: `${BASE}/events/${e.slug}?record=1` });
    await waitForFrames(`${e.slug} first product`);
    const tabs = await run(() => [...document.querySelectorAll('button[aria-pressed]')].map((b) => b.textContent));
    for (const tab of tabs.slice(1)) {
      await run((t) => [...document.querySelectorAll('button[aria-pressed]')].find((b) => b.textContent === t)?.click(), tab);
      await sleep(1500);
      await waitForFrames(`${e.slug} ${tab}`);
    }
    await sleep(4000); // warnings and storm detections for the last product
    const rec = (await run(() => window.__replayRecord)) || {};
    const responses = Object.fromEntries(Object.entries(rec).map(([url, text]) => [url, trim(text, e)]));
    const out = JSON.stringify({ slug: e.slug, recorded: new Date().toISOString().slice(0, 10), responses });
    writeFileSync(`public/replays/${e.slug}.json`, out);
    console.log(`${e.slug}: ${Object.keys(responses).length} responses, ${Math.round(out.length / 1024)} KB (${tabs.join(', ')})`);
  } catch (err) {
    failed++;
    console.log(`${e.slug}: FAILED ${err.message}`);
  }
}

ws.close();
chrome.kill();
await sleep(500);
try {
  rmSync(profile, { recursive: true, force: true });
} catch {
  // Chrome may still hold files for a moment; the OS cleans temp folders
}
process.exit(failed ? 1 : 0);
