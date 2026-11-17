// Background worker for Level II: get volumes (real-time chunks or archived
// files), decompress and index them, and hand out single tilts of single
// moments (also drawn as an overview image, for browsers without WebGL2).

import { indexVolume, tiltsFor, sweepMoment } from './decode';
import { liveVolumes, previousVolume } from './live';
import { buildLut, scanBounds, scanImageSize, renderBox } from '../level3/render';

const BUCKET = 'https://unidata-nexrad-level2.s3.amazonaws.com';
const volumes = new Map(); // archive key -> Promise<volume>

function archiveVolume(key) {
  if (!volumes.has(key)) {
    const job = fetch(`${BUCKET}/${key}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Level II archive returned ${r.status}.`);
        return r.arrayBuffer();
      })
      .then((buf) => indexVolume(buf));
    job.catch(() => volumes.delete(key));
    volumes.set(key, job);
    while (volumes.size > 2) volumes.delete(volumes.keys().next().value);
  }
  return volumes.get(key);
}

// Nearest tilt to the wanted angle (angles wobble by ~0.05° between volumes).
function nearest(tilts, want) {
  if (!tilts.length) return null;
  if (!want) return tilts[0];
  const w = Number(want);
  const best = tilts.reduce((a, b) => (Math.abs(b.elevation - w) < Math.abs(a.elevation - w) ? b : a));
  return Math.abs(best.elevation - w) <= 0.25 ? best : null;
}

function render(vol, pick, msg, cutKey) {
  const dec = sweepMoment(vol, pick.n, msg.moment);
  const bounds = scanBounds(dec);
  const { width, height } = scanImageSize(bounds, msg.maxSize);
  const image = renderBox(dec, buildLut(dec, msg.colors), bounds, width, height);
  const { data, starts, deltas, ...meta } = dec;
  return {
    cutKey,
    meta: { ...meta, scanTime: dec.scanTime.getTime(), tilt: pick.tilt },
    data, starts, deltas, image,
    transfer: [data.buffer, starts.buffer, deltas.buffer, image.rgba.buffer],
  };
}

const listTilts = (vol, moment) => tiltsFor(vol, moment).map(({ tilt, elevation }) => ({ tilt, elevation }));

async function handle(msg) {
  if (msg.type === 'tilts' || msg.type === 'sweep') {
    const vol = await archiveVolume(msg.key);
    const tilts = tiltsFor(vol, msg.moment);
    if (msg.type === 'tilts') return { tilts: listTilts(vol, msg.moment) };
    const pick = nearest(tilts, msg.tilt) || tilts[0];
    if (!pick) throw new Error('This product is not in this volume.');
    return render(vol, pick, msg, `${msg.key}/${pick.n}/${msg.moment}`);
  }

  // Real time: newest finished tilt, from the volume being scanned if that
  // tilt is already done there, else from the previous (complete) volume.
  const { cur } = await liveVolumes(msg.icao);
  if (msg.type === 'livetilts') {
    // The full tilt list comes from the last complete volume.
    const base = (await previousVolume(msg.icao))?.index || cur?.index;
    if (!base) throw Object.assign(new Error('No real-time Level II data for this radar yet.'), { code: 'NO_DATA' });
    return { tilts: listTilts(base, msg.moment) };
  }
  const tryVol = (v) => {
    if (!v?.index) return null;
    const tilts = tiltsFor(v.index, msg.moment);
    const pick = msg.tilt ? nearest(tilts, msg.tilt) : tilts[0];
    // Without a chosen tilt we want the lowest; a partial volume's first cut is the lowest.
    return pick ? { v, pick } : null;
  };
  const hit = tryVol(cur) || tryVol(await previousVolume(msg.icao));
  if (!hit) {
    throw Object.assign(new Error('No real-time Level II data for this radar yet.'), { code: 'NO_DATA' });
  }
  const cutKey = `${msg.icao}/${hit.v.n}/${hit.v.stamp}/${hit.pick.n}/${msg.moment}`;
  if (msg.known === cutKey) return { unchanged: true, cutKey };
  return render(hit.v.index, hit.pick, msg, cutKey);
}

self.onmessage = async (e) => {
  try {
    const { transfer = [], ...out } = await handle(e.data);
    self.postMessage({ id: e.data.id, ok: true, ...out }, transfer);
  } catch (err) {
    self.postMessage({ id: e.data.id, ok: false, error: err.message, code: err.code });
  }
};
