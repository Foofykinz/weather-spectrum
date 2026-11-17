import { useEffect, useState } from 'react';
import { listLevel3Before, fetchLevel3Key } from './providers/level3';
import { listLevel2Before, fetchLevel2Key } from './providers/level2';
import { glRadarSupported } from './gl/support';

// Past radar: the real scans at or before a chosen time.
//  - Single-radar products: the archived NOAA Level III files themselves,
//    decoded and drawn exactly like live scans.
//  - National mosaic: IEM's archived mosaic images for those times.
// Nothing is interpolated between scans; each frame is one real scan.

export const ARCHIVE_FRAMES = 10;
// Oldest data we can show: Level II volumes in the current (message 31)
// format, from 2009. Level III single-radar products start April 2020;
// before that, single-radar views switch to their Level II equivalents.
export const ARCHIVE_START = new Date('2009-01-01T00:00:00Z');
// Overview image per frame: only a backup when the GPU draws (it uses the data itself).
const archiveDrawSize = () => (glRadarSupported() ? 512 : 1024);
const CONCURRENCY = 3;

// URL value <-> Date. Stored as UTC minutes: 2024-05-06T20:00Z
export function timeFromParam(v) {
  if (!v || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/.test(v)) return null;
  const d = new Date(v.replace('Z', ':00Z'));
  return Number.isNaN(d.getTime()) || d > new Date() || d < ARCHIVE_START ? null : d;
}
export const timeToParam = (d) => d.toISOString().slice(0, 16) + 'Z';

export async function loadArchive(product, site, tilt, end, signal, onProgress) {
  const a = product.archive;
  if (a.times) {
    const times = await a.times(site, end, ARCHIVE_FRAMES, signal);
    if (!times.length) {
      const err = new Error('No mosaic images around that time.');
      err.code = 'NO_DATA';
      throw err;
    }
    return times.map((t) => ({ validTime: t, details: null, layer: product.layer(site, t) }));
  }
  // Level II: archived volumes, each read only as far as the chosen tilt.
  if (a.level2) {
    const keys = await listLevel2Before(site.icao, end, ARCHIVE_FRAMES, signal);
    return runFrames(keys, signal, onProgress, async (key) => {
      const { validTime, details } = await fetchLevel2Key(key, a.level2, a.colors, { tilt, drawSize: archiveDrawSize() });
      return { validTime, details, layer: product.layer(site, validTime, details) };
    });
  }
  // Try each file code in turn (newest product form first).
  let keys = null;
  for (const code of a.level3(tilt)) {
    try {
      keys = await listLevel3Before(site.id, code, end, ARCHIVE_FRAMES, signal);
      break;
    } catch (err) {
      if (err.code !== 'NO_DATA') throw err;
    }
  }
  if (!keys) {
    const err = new Error('No scans for this product at this radar around that time.');
    err.code = 'NO_DATA';
    throw err;
  }
  return runFrames(keys, signal, onProgress, async (key) => {
    const { validTime, details } = await fetchLevel3Key(key, a.colors, { drawSize: archiveDrawSize() });
    return { validTime, details, layer: product.layer(site, validTime, details) };
  });
}

// Load frames a few at a time, in order, reporting progress.
async function runFrames(keys, signal, onProgress, load) {
  const frames = new Array(keys.length);
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < keys.length) {
      const i = next++;
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      frames[i] = await load(keys[i]);
      onProgress(++done, keys.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, keys.length) }, worker));
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  return frames;
}

// { status: 'idle' | 'loading' | 'ok' | 'error', frames, progress: [done, total], error }
export function useArchive(product, site, tilt, end) {
  const [state, setState] = useState({ status: 'idle' });
  const key = end && product?.archive && (product.scope !== 'site' || site) ? `${product.id}|${site?.id || ''}|${tilt || ''}|${end.getTime()}` : '';
  useEffect(() => {
    if (!key) {
      setState({ status: 'idle' });
      return undefined;
    }
    const c = new AbortController();
    setState({ status: 'loading', key, progress: [0, 0] });
    loadArchive(product, site, tilt, end, c.signal, (done, total) => !c.signal.aborted && setState((s) => ({ ...s, progress: [done, total] })))
      .then((frames) => !c.signal.aborted && setState({ status: 'ok', key, frames }))
      .catch((error) => {
        if (!c.signal.aborted && error.name !== 'AbortError') setState({ status: 'error', key, error });
      });
    return () => c.abort();
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return state.key === key ? state : { status: key ? 'loading' : 'idle', progress: [0, 0] };
}
