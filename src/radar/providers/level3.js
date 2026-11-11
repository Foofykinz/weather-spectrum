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

import { groundDistAz, slantRangeKm, beamHeightKm, buildAzimuthTable, levelToValue } from '../level3/geometry';

const BUCKET = 'https://unidata-nexrad-level3.s3.amazonaws.com';

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

// Small cache of processed scans (each holds a drawn image, so keep it short).
const cache = new Map(); // key -> result
const CACHE_SIZE = 3;

// Smaller drawing on small screens to limit memory on phones.
const drawSize = () => (Math.min(window.innerWidth, window.innerHeight) < 700 ? 1536 : 2048);

export async function fetchLevel3Latest(site, code, colors, signal) {
  const key = await latestKey(site.id, code, signal);
  if (cache.has(key)) return cache.get(key);

  const t0 = performance.now();
  const res = await fetch(`${BUCKET}/${key}`, { signal });
  if (!res.ok) throw new Error(`Level III archive returned ${res.status}.`);
  const buffer = await res.arrayBuffer();
  const t1 = performance.now();
  const sizeKb = buffer.byteLength / 1024;

  const out = await runWorker(buffer, colors, drawSize());
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
      canvas,
      bounds: out.image.bounds,
      radial: { ...m, data: out.data, starts: out.starts, deltas: out.deltas, azTable: buildAzimuthTable(out.starts, out.deltas) },
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
  cache.set(key, result);
  while (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value);
  return result;
}

// Read the exact value of the range bin under a map point.
export function probeLevel3(details, lat, lon) {
  const r = details?.radial;
  if (!r) return null;
  const { km, az } = groundDistAz(r.lat, r.lon, lat, lon);
  const slant = slantRangeKm(km, r.elevation);
  const bin = Math.floor(slant / r.binKm) - r.firstBin;
  const base = { azimuth: az, groundKm: km, slantKm: slant, beamKm: beamHeightKm(slant, r.elevation), elevation: r.elevation };
  if (bin < 0 || bin >= r.nbins) return { ...base, status: 'out-of-range' };
  const rad = r.azTable[Math.floor(az * 10) % 3600];
  if (rad < 0) return { ...base, status: 'no-radial' };
  const level = r.data[rad * r.nbins + bin];
  if (level === 0) return { ...base, status: 'below-threshold' };
  if (level === 1) return { ...base, status: 'range-folded' };
  return { ...base, status: 'value', value: levelToValue(level, r.scale, r.offset), level, radialStart: r.starts[rad], bin };
}
