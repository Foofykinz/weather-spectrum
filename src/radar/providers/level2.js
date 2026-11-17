// NEXRAD Level II: the radar's full-resolution volume scans, every tilt,
// from NOAA's open data on AWS (Unidata bucket). Files appear once a volume
// is complete, roughly 5-15 minutes after it starts.
// Keys look like 2026/11/17/KTLX/KTLX20261117_103733_V06.

import { buildAzimuthTable } from '../level3/geometry';
import { glRadarSupported } from '../gl/support';

const BUCKET = 'https://unidata-nexrad-level2.s3.amazonaws.com';
export const LEVEL2_ATTRIBUTION =
  'Radar: NOAA NEXRAD Level II via <a href="https://registry.opendata.aws/noaa-nexrad/" target="_blank" rel="noopener noreferrer">NODD/Unidata</a>';

let worker = null;
let nextId = 1;
const pending = new Map();
function call(msg) {
  if (!worker) {
    worker = new Worker(new URL('../level2/worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const job = pending.get(e.data.id);
      if (!job) return;
      pending.delete(e.data.id);
      if (e.data.ok) job.resolve(e.data);
      else job.reject(Object.assign(new Error(e.data.error), { code: e.data.code }));
    };
  }
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, ...msg });
  });
}

const pad = (n) => String(n).padStart(2, '0');
const dayPrefix = (icao, d) => `${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}/${icao}/`;
const stamp = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}_${pad(d.getUTCHours())}`;

// Newest complete volume for a radar. Lists only the last couple of hours
// (start-after) so each check is a few KB.
async function listKeys(prefix, startAfter, signal) {
  const res = await fetch(`${BUCKET}/?list-type=2&prefix=${prefix}${startAfter ? `&start-after=${startAfter}` : ''}`, { signal, cache: 'no-store' });
  if (!res.ok) throw new Error(`Level II archive returned ${res.status}.`);
  // Volumes end in _V0x (older ones in _V0x.gz); _MDM files are metadata only.
  return [...(await res.text()).matchAll(/<Key>([^<]+_V\d+(?:\.gz)?)<\/Key>/g)].map((m) => m[1]).sort();
}

// The `count` newest archived volumes that started at or before `end`.
export async function listLevel2Before(icao, end, count, signal) {
  let found = [];
  for (let d = 0; d < 3 && found.length < count; d++) {
    const day = new Date(end.getTime() - d * 86400e3);
    const keys = (await listKeys(dayPrefix(icao, day), null, signal)).filter((k) => level2KeyTime(k) <= end);
    found = keys.concat(found);
  }
  if (!found.length) {
    throw Object.assign(new Error('No Level II volumes for this radar around that time.'), { code: 'NO_DATA' });
  }
  return found.slice(-count);
}

export async function latestLevel2Key(icao, signal) {
  const now = new Date();
  const back = new Date(now.getTime() - 2 * 3600e3);
  const today = dayPrefix(icao, now);
  let keys = await listKeys(today, back.getUTCDate() === now.getUTCDate() ? `${today}${icao}${stamp(back)}` : null, signal);
  if (!keys.length) keys = await listKeys(dayPrefix(icao, back), null, signal); // just after midnight UTC
  if (keys.length) return keys[keys.length - 1];
  const err = new Error('No recent Level II volumes for this radar.');
  err.code = 'NO_DATA';
  throw err;
}

export const level2KeyTime = (key) => {
  const m = /(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})_V\d+(?:\.gz)?$/.exec(key);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])) : null;
};

// Tilts in the newest volume for a moment: [{ tilt: '0.5', elevation }]
export async function listLevel2Tilts(site, moment, signal) {
  const key = await latestLevel2Key(site.icao, signal);
  return (await call({ type: 'tilts', key, moment })).tilts;
}

// ---- real time (chunk feed): the newest finished tilt, typically 1-3
// minutes behind the radar instead of 5-15 for complete archive files.
// Radars missing from the real-time feed fall back to the archive files.
export async function listLevel2LiveTilts(site, moment, signal) {
  try {
    return (await call({ type: 'livetilts', icao: site.icao, moment })).tilts;
  } catch (err) {
    if (err.code !== 'NO_DATA') throw err;
    return listLevel2Tilts(site, moment, signal);
  }
}

const liveLast = new Map(); // icao|moment|tilt -> { cutKey, result }
export async function fetchLevel2Live(site, moment, colors, signal, { tilt, drawSize: size } = {}) {
  const id = `${site.icao}|${moment}|${tilt || ''}`;
  const last = liveLast.get(id);
  let out;
  try {
    out = await call({ type: 'live', icao: site.icao, moment, tilt, colors, maxSize: size || drawSize(), known: last?.cutKey });
  } catch (err) {
    if (err.code !== 'NO_DATA') throw err;
    return fetchLevel2Latest(site, moment, colors, signal, { tilt, drawSize: size }); // not in the real-time feed
  }
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  if (out.unchanged && last) return last.result; // same tilt scan as last time: nothing to redraw
  const result = toResult(out, colors, out.cutKey);
  liveLast.set(id, { cutKey: out.cutKey, result });
  while (liveLast.size > 8) liveLast.delete(liveLast.keys().next().value);
  return result;
}

function toResult(out, colors, id) {
  const m = out.meta;
  const canvas = document.createElement('canvas');
  canvas.width = out.image.width;
  canvas.height = out.image.height;
  canvas.getContext('2d').putImageData(new ImageData(out.image.rgba, out.image.width, out.image.height), 0, 0);
  return {
    validTime: new Date(m.scanTime),
    details: {
      vcp: m.vcp,
      elevation: Number(m.tilt), // display angle (0.1°); the precise mean angle stays in radial for beam math
      tilt: m.tilt,
      radialDeg: Math.round((360 / m.nrad) * 10) / 10,
      level2: true,
      canvas,
      bounds: out.image.bounds,
      radial: { ...m, key: id, colors, data: out.data, starts: out.starts, deltas: out.deltas, azTable: buildAzimuthTable(out.starts, out.deltas) },
      perf: { file: id },
    },
  };
}

const results = new Map(); // `${key}|${moment}|${tilt}@${size}` -> Promise
const drawSize = () => (glRadarSupported() ? 512 : Math.min(window.innerWidth, window.innerHeight) < 700 ? 1536 : 2048); // backup image only when the GPU draws

export async function fetchLevel2Latest(site, moment, colors, signal, { tilt, drawSize: size } = {}) {
  const key = await latestLevel2Key(site.icao, signal);
  return fetchLevel2Key(key, moment, colors, { tilt, drawSize: size });
}

export function fetchLevel2Key(key, moment, colors, { tilt, drawSize: size } = {}) {
  const maxSize = size || drawSize();
  const id = `${key}|${moment}|${tilt || ''}@${maxSize}`;
  if (!results.has(id)) {
    const job = call({ type: 'sweep', key, moment, tilt, colors, maxSize }).then((out) => toResult(out, colors, out.cutKey));
    job.catch(() => results.delete(id));
    results.set(id, job);
    while (results.size > 6) results.delete(results.keys().next().value);
  }
  return results.get(id);
}
