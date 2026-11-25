// NOAA NEXRAD Level III files, decoded in the browser.
//
// Source: the public NEXRAD Level III archive on AWS (NOAA Open Data
// Dissemination, maintained by Unidata). It is updated in near real time
// (~3-4 min after each scan) and allows direct browser access (CORS).
// Unlike the map services, these files contain the actual measured values,
// so we draw them with our own (official NWS) color tables and can read the
// exact value of any range bin.
//
// Cost control:
//  - checking for a new scan = one ~1 KB listing request
//  - a file (~10-250 KB) is downloaded only when a new scan exists
//  - decoding/drawing runs in a background worker (main thread stays smooth)
//  - recent results are cached, so switching back costs nothing

import { groundDistAz, slantRangeKm, beamHeightKm, buildAzimuthTable } from '../level3/geometry';
import { makeScaler } from '../level3/scaling';

const BUCKET = 'https://unidata-nexrad-level3.s3.amazonaws.com';

import { glRadarSupported } from '../gl/support';
import { archiveFetch } from '../savedData';

export const LEVEL3_ATTRIBUTION =
  'Radar: NOAA NEXRAD Level III via <a href="https://registry.opendata.aws/noaa-nexrad/" target="_blank" rel="noopener noreferrer">NODD/Unidata</a>';

// ---- background worker (created on first use only)
let worker = null;
let nextId = 1;
const pending = new Map();
function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('../level3/worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const job = pending.get(e.data.id);
      if (!job) return;
      pending.delete(e.data.id);
      if (e.data.ok) job.resolve(e.data);
      else job.reject(new Error(e.data.error));
    };
  }
  return worker;
}
function runWorker(buffer, colors, maxSize) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, buffer, colors, maxSize }, [buffer]);
  });
}

// Second worker for sharp zoomed-in redraws, so they never wait behind a
// scan being decoded (and vice versa).
let viewWorker = null;
const viewPending = new Map();
const viewSent = new WeakSet(); // scans this worker already has
let viewCurrent = null;
function getViewWorker() {
  if (!viewWorker) {
    viewWorker = new Worker(new URL('../level3/worker.js', import.meta.url), { type: 'module' });
    viewWorker.onmessage = (e) => {
      const job = viewPending.get(e.data.id);
      if (!job) return;
      viewPending.delete(e.data.id);
      if (e.data.ok) job.resolve(e.data.image);
      else job.reject(new Error(e.data.error));
    };
  }
  return viewWorker;
}

// Draw a decoded scan for one map area at the given pixel size (the area on
// screen when zoomed in). Same bin-exact drawing as the overview image.
export function renderLevel3View(radial, bounds, width, height) {
  const w = getViewWorker();
  const id = nextId++;
  // The worker keeps one scan; send the data only when it changes.
  let scan = null;
  if (viewCurrent !== radial || !viewSent.has(radial)) {
    const { scaler, colors, key, ...rest } = radial; // eslint-disable-line no-unused-vars
    scan = rest;
    viewSent.add(radial);
    viewCurrent = radial;
  }
  return new Promise((resolve, reject) => {
    viewPending.set(id, { resolve, reject });
    w.postMessage({ type: 'view', id, key: radial.key, scan, colors: radial.colors, bounds, width, height });
  }).catch((err) => {
    if (err.message !== 'missing-scan') throw err;
    viewSent.delete(radial); // worker was given another scan meanwhile: resend
    viewCurrent = null;
    return renderLevel3View(radial, bounds, width, height);
  });
}

// ---- newest file for a radar + product, e.g. ("TLX", "N0C")
const pad = (n) => String(n).padStart(2, '0');
const hourPrefix = (site, code, d) =>
  `${site}_${code}_${d.getUTCFullYear()}_${pad(d.getUTCMonth() + 1)}_${pad(d.getUTCDate())}_${pad(d.getUTCHours())}`;

async function latestKey(site, code, signal) {
  const now = new Date();
  // Look in the current UTC hour first, then the previous one.
  for (const d of [now, new Date(now.getTime() - 3600e3)]) {
    const res = await fetch(`${BUCKET}/?list-type=2&prefix=${hourPrefix(site, code, d)}`, { signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`Level III archive returned ${res.status}.`);
    const keys = [...(await res.text()).matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]);
    if (keys.length) return keys.sort()[keys.length - 1];
  }
  const err = new Error('No recent scans for this product at this radar.');
  err.code = 'NO_DATA';
  throw err;
}

// ---- archived scans: the `count` newest files at or before `end`
// File names carry the scan time: TLX_N0B_2024_05_06_19_58_31
export function level3KeyTime(key) {
  const m = /_(\d{4})_(\d{2})_(\d{2})_(\d{2})_(\d{2})_(\d{2})$/.exec(key);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : NaN;
}
const listingCache = new Map(); // hour prefix -> keys (only hours that are over)

async function listHour(prefix, hourEnd, signal) {
  if (listingCache.has(prefix)) return listingCache.get(prefix);
  // Hours that are over can come from a saved copy (replays); the current hour can't.
  const url = `${BUCKET}/?list-type=2&prefix=${prefix}`;
  const res = await (hourEnd < Date.now() - 600e3 ? archiveFetch : fetch)(url, { signal });
  if (!res.ok) throw new Error(`Level III archive returned ${res.status}.`);
  const keys = [...(await res.text()).matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]);
  if (hourEnd < Date.now() - 600e3) listingCache.set(prefix, keys);
  return keys;
}

export async function listLevel3Before(siteId, code, end, count, signal) {
  const endMs = end.getTime();
  let found = [];
  // Walk back hour by hour (a radar can be down for a while; give up after 6 h).
  for (let h = 0; h < 6 && found.length < count; h++) {
    const d = new Date(endMs - h * 3600e3);
    const hourEnd = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours() + 1);
    const keys = (await listHour(hourPrefix(siteId, code, d), hourEnd, signal)).filter((k) => level3KeyTime(k) <= endMs);
    found = keys.concat(found);
  }
  found.sort((a, b) => level3KeyTime(a) - level3KeyTime(b));
  if (!found.length) {
    const err = new Error('No scans for this product at this radar around that time.');
    err.code = 'NO_DATA';
    throw err;
  }
  return found.slice(-count);
}

// ---- which elevation tilts exist right now, and their real angles
// One ~1 KB listing per tilt, plus the first 400 bytes of each newest file
// (enough to read the elevation angle from its header). Results are cached
// per file, so this costs almost nothing after the first call.
const angleCache = new Map(); // file key -> elevation angle (deg)

async function readElevation(key, signal) {
  if (angleCache.has(key)) return angleCache.get(key);
  const res = await fetch(`${BUCKET}/${key}`, { signal, headers: { Range: 'bytes=0-399' } });
  if (!res.ok) throw new Error(`Level III archive returned ${res.status}.`);
  const b = new Uint8Array(await res.arrayBuffer());
  let mh = -1;
  for (let i = 0; i < b.length - 1; i++) if (b[i] === 0xff && b[i + 1] === 0xff) { mh = i - 18; break; }
  if (mh < 0 || mh + 60 > b.length) throw new Error('Unreadable Level III header.');
  const elev = new DataView(b.buffer).getInt16(mh + 58) / 10; // halfword 30
  angleCache.set(key, elev);
  return elev;
}

export async function listLevel3Tilts(site, letter, tilts, signal) {
  const found = await Promise.all(
    tilts.map(async (tilt) => {
      try {
        const key = await latestKey(site.id, `${tilt}${letter}`, signal);
        return { tilt, key, elevation: await readElevation(key, signal) };
      } catch (err) {
        if (err.name === 'AbortError') throw err;
        return null; // this tilt isn't available right now
      }
    })
  );
  return found.filter(Boolean).sort((a, b) => a.elevation - b.elevation);
}

// Small cache of processed scans (each holds a drawn image, so keep it short).
const cache = new Map(); // key -> result
const CACHE_SIZE = 44; // loops of two products for this warning and the next (broadcast), quad views

// Smaller drawing on small screens to limit memory on phones.
// The full-size image is only a backup when the GPU draws the scan (it draws
// from the data itself), so keep it small then.
const drawSize = () => (glRadarSupported() ? 512 : Math.min(window.innerWidth, window.innerHeight) < 700 ? 1536 : 2048);

// Requests for the same scan at the same drawing size share one download and
// decode (e.g. two panels showing the same product), even if they overlap in time.
const inflight = new Map();

export async function fetchLevel3Latest(site, code, colors, signal, { drawSize: size } = {}) {
  const key = await latestKey(site.id, code, signal);
  return fetchLevel3Key(key, colors, { drawSize: size });
}

// One specific archived file (e.g. from listLevel3Before), decoded and drawn.
export function fetchLevel3Key(key, colors, { drawSize: size } = {}) {
  const maxSize = size || drawSize();
  const cacheKey = `${key}@${maxSize}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  if (!inflight.has(cacheKey)) {
    const job = processScan(key, colors, maxSize).finally(() => inflight.delete(cacheKey));
    inflight.set(cacheKey, job);
  }
  return inflight.get(cacheKey);
}

async function processScan(key, colors, maxSize) {
  const cacheKey = `${key}@${maxSize}`;

  const t0 = performance.now();
  // Not cancellable: the result is shared through the cache and in-flight map.
  const res = await fetch(`${BUCKET}/${key}`);
  if (!res.ok) throw new Error(`Level III archive returned ${res.status}.`);
  const buffer = await res.arrayBuffer();
  const t1 = performance.now();
  const sizeKb = buffer.byteLength / 1024;

  const out = await runWorker(buffer, colors, maxSize);
  const t2 = performance.now();

  // Paint the worker's pixels into a canvas the map can display.
  const canvas = document.createElement('canvas');
  canvas.width = out.image.width;
  canvas.height = out.image.height;
  canvas.getContext('2d').putImageData(new ImageData(out.image.rgba, out.image.width, out.image.height), 0, 0);
  const t3 = performance.now();

  const m = out.meta;
  const result = {
    validTime: new Date(m.scanTime),
    details: {
      vcp: m.vcp,
      elevation: m.elevation,
      radialDeg: Math.round((360 / m.nrad) * 10) / 10,
      canvas,
      bounds: out.image.bounds,
      radial: { ...m, key, colors, data: out.data, starts: out.starts, deltas: out.deltas, azTable: buildAzimuthTable(out.starts, out.deltas) },
      perf: {
        file: key,
        downloadKb: Math.round(sizeKb),
        downloadMs: Math.round(t1 - t0),
        decodeMs: Math.round(out.timings.decodeMs),
        drawMs: Math.round(out.timings.renderMs),
        workerTotalMs: Math.round(t2 - t1),
        paintMs: Math.round(t3 - t2),
        image: `${out.image.width}x${out.image.height}`,
      },
    },
  };
  cache.set(cacheKey, result);
  while (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value);
  return result;
}

// Read the exact value of the range bin under a map point.
export function probeLevel3(details, lat, lon) {
  const r = details?.radial;
  if (!r) return null;
  const { km, az } = groundDistAz(r.lat, r.lon, lat, lon);
  const slant = slantRangeKm(km, r.elevation);
  const bin = Math.floor(slant / r.binKm - r.firstBin); // firstBin may be fractional (Level II)
  const base = { azimuth: az, groundKm: km, slantKm: slant, beamKm: beamHeightKm(slant, r.elevation), elevation: Math.round(r.elevation * 10) / 10 };
  if (bin < 0 || bin >= r.nbins) return { ...base, status: 'out-of-range' };
  const rad = r.azTable[Math.floor(az * 10) % 3600];
  if (rad < 0) return { ...base, status: 'no-radial' };
  const level = r.data[rad * r.nbins + bin];
  const scaler = r.scaler || (r.scaler = makeScaler(r));
  const flag = scaler.flag(level);
  if (flag) return { ...base, status: flag };
  return { ...base, status: 'value', value: scaler.value(level), topped: scaler.topped(level), level, radialStart: r.starts[rad], bin };
}
