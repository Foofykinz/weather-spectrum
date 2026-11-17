// Real-time Level II from NOAA's chunk feed (Unidata bucket
// unidata-nexrad-level2-chunks). Each radar has 999 numbered folders used in
// rotation, one volume scan per folder, written as chunks while the radar
// scans: YYYYMMDD-HHMMSS-001-S (start), ...-I (intermediate), ...-E (end).
// Concatenated, a folder's chunks form a normal Level II file.
//
// We keep two volumes per radar: the newest one (possibly still being
// scanned) and the one before it (complete). A tilt is shown from the newest
// volume as soon as that tilt has finished scanning; otherwise from the
// previous volume. Runs inside the Level II worker.

import { recordsOf, indexBlocks } from './decode';

const CHUNKS = 'https://unidata-nexrad-level2-chunks.s3.amazonaws.com';
const N = 999;
const radars = new Map(); // icao -> { latest, vols: Map(n -> vol state) }

async function listKeys(prefix, max, startAfter) {
  const url = `${CHUNKS}/?list-type=2&prefix=${prefix}${max ? `&max-keys=${max}` : ''}${startAfter ? `&start-after=${startAfter}` : ''}`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`Level II real-time feed returned ${r.status}.`);
  return [...(await r.text()).matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]);
}
const stampOf = (key) => key.split('/')[2]?.slice(0, 15) || ''; // YYYYMMDD-HHMMSS (volume start)
const fmt = (d) => d.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
const wrap = (n) => ((n - 1 + N) % N) + 1;

// Folders are reused but keep older volumes' chunks too, so we always ask
// for keys after a time: the start time of folder n's first volume newer
// than `stamp` ('' if none).
async function newerIn(icao, n, stamp) {
  const [k] = await listKeys(`${icao}/${n}/`, 1, `${icao}/${n}/${stamp}`);
  return k ? stampOf(k) : '';
}

// The folder holding the newest volume (and its start time).
// First call: find any folder with a volume from the last 30 hours, then
// search forward for the last such folder (~15 tiny listings). Folders are
// written in order, so recent ones form one run ending at the newest.
// Later calls: just check whether the next folder has a newer volume.
async function latestFolder(icao, st) {
  if (st.latest) {
    let { latest: n, stamp } = st;
    for (let i = 0; i < 5; i++) {
      const s = await newerIn(icao, wrap(n + 1), stamp);
      if (!s) break;
      n = wrap(n + 1);
      stamp = s;
    }
    return { n, stamp };
  }
  const since = fmt(new Date(Date.now() - 30 * 3600e3));
  const samples = [];
  for (let n = 1; n <= N; n += 120) samples.push(n);
  const found = await Promise.all(samples.map((n) => newerIn(icao, n, since)));
  const start = samples[found.findIndex(Boolean)] || 0;
  if (!start) throw Object.assign(new Error('No real-time Level II data for this radar.'), { code: 'NO_DATA' });
  let lo = 0;
  let hi = 500;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (await newerIn(icao, wrap(start + mid), since)) lo = mid;
    else hi = mid - 1;
  }
  const n = wrap(start + lo);
  return { n, stamp: await newerIn(icao, n, since) };
}

// Download any new chunks of the volume that started at `stamp` in folder n,
// and re-index it.
async function loadVolume(icao, st, n, stamp) {
  let v = st.vols.get(n);
  const keys = stamp ? (await listKeys(`${icao}/${n}/`, 0, `${icao}/${n}/${stamp}`)).sort() : [];
  if (!v || v.stamp !== stamp) v = { n, stamp, chunks: new Map(), index: null };
  const mine = keys.filter((k) => stampOf(k) === stamp);
  // New chunks, 8 downloads at a time. Chunks are only used in order, so a
  // failed one (and everything after it) is simply retried next time.
  const missing = mine.filter((k) => !v.chunks.has(k));
  const got = new Map();
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(8, missing.length) }, async () => {
      while (next < missing.length) {
        const k = missing[next++];
        try {
          const r = await fetch(`${CHUNKS}/${k}`);
          if (r.ok) got.set(k, await r.arrayBuffer());
        } catch {
          // retried next update
        }
      }
    })
  );
  let added = false;
  for (const k of missing) {
    if (!got.has(k)) break;
    v.chunks.set(k, recordsOf(got.get(k)));
    added = true;
  }
  const complete = mine.some((k) => k.endsWith('-E'));
  if (added || !v.index || v.complete !== complete) {
    const blocks = [...v.chunks.keys()].sort().flatMap((k) => v.chunks.get(k));
    try {
      v.index = indexBlocks(blocks, complete);
    } catch {
      v.index = null; // nothing but metadata yet
    }
    v.complete = complete;
  }
  st.vols.set(n, v);
  return v;
}

// -> { cur, prev }: newest volume (maybe partial) and the complete one before it.
// Overlapping requests for the same radar share one update.
export function liveVolumes(icao) {
  let st = radars.get(icao);
  if (!st) {
    st = { latest: 0, vols: new Map(), busy: null };
    radars.set(icao, st);
    while (radars.size > 2) radars.delete(radars.keys().next().value);
  }
  if (!st.busy) st.busy = update(icao, st).finally(() => (st.busy = null));
  return st.busy;
}

async function update(icao, st) {
  const { n, stamp } = await latestFolder(icao, st);
  st.latest = n;
  st.stamp = stamp;
  const cur = await loadVolume(icao, st, n, stamp);
  for (const k of [...st.vols.keys()]) if (k !== n && k !== wrap(n - 1)) st.vols.delete(k);
  const prev = st.vols.get(wrap(n - 1));
  return { cur, prev: prev?.complete ? prev : null };
}

// The complete volume before the newest one, loaded on demand (for the tilt
// list, or a tilt the radar hasn't reached yet in its current scan).
export async function previousVolume(icao) {
  const st = radars.get(icao);
  if (!st?.latest) return null;
  const n = wrap(st.latest - 1);
  const have = st.vols.get(n);
  if (have?.complete) return have;
  if (!st.prevBusy) {
    const since = fmt(new Date(Date.now() - 30 * 3600e3));
    st.prevBusy = newerIn(icao, n, since)
      .then((stamp) => loadVolume(icao, st, n, stamp))
      .finally(() => (st.prevBusy = null));
  }
  return st.prevBusy;
}
