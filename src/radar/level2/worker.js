// Background worker for Level II: get volumes (real-time chunks or archived
// files), decompress and index them, and hand out single tilts of single
// moments (also drawn as an overview image, for browsers without WebGL2).

import { indexVolume, indexBlocks, recordsOf, tiltsFor, sweepMoment } from './decode';
import { bunzip } from './bunzip.js';
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

// One tilt from an archived volume, downloading only as much of the file as
// needed: 1 MB at a time, stopping once that tilt has been fully read (the
// radar scans low tilts first, so the lowest needs about a quarter of the
// file). Older gzip-wrapped files are read whole.
const STEP = 1 << 20;
async function archiveSweep(key, moment, want) {
  const url = `${BUCKET}/${key}`;
  const choose = (vol, final) => {
    const tilts = tiltsFor(vol, moment);
    const pick = want ? nearest(tilts, want) : tilts[0];
    return pick || (final ? tilts[0] : null);
  };
  if (key.endsWith('.gz')) {
    // Older files: gzip around ~45 MB of raw messages. Unzip while
    // downloading and stop once the tilt is complete.
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Level II archive returned ${r.status}.`);
    const reader = r.body.pipeThrough(new DecompressionStream('gzip')).getReader();
    let buf = new Uint8Array(8 << 20);
    let len = 0;
    let checked = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (value) {
        if (len + value.length > buf.length) {
          const bigger = new Uint8Array(Math.max(buf.length * 2, len + value.length));
          bigger.set(buf.subarray(0, len));
          buf = bigger;
        }
        buf.set(value, len);
        len += value.length;
      }
      if (done || len - checked >= 4 << 20) {
        checked = len;
        let vol = null;
        try {
          vol = indexBlocks(recordsOf(buf.subarray(0, len)), done);
        } catch (err) {
          if (done) throw err;
        }
        const pick = vol && choose(vol, done);
        if (pick) {
          reader.cancel().catch(() => {});
          return { vol, pick };
        }
        if (done) throw new Error('This product is not in this volume.');
      }
    }
  }
  let bytes = new Uint8Array(0);
  let total = Infinity;
  const more = async () => {
    if (bytes.length >= total) return false;
    const r = await fetch(url, { headers: { Range: `bytes=${bytes.length}-${bytes.length + STEP - 1}` } });
    if (r.status === 416) return false;
    if (!r.ok) throw new Error(`Level II archive returned ${r.status}.`);
    const m = /\/(\d+)$/.exec(r.headers.get('Content-Range') || '');
    total = m ? +m[1] : bytes.length + 0; // no Content-Range: the whole file came back
    const chunk = new Uint8Array(await r.arrayBuffer());
    const next = new Uint8Array(bytes.length + chunk.length);
    next.set(bytes);
    next.set(chunk, bytes.length);
    bytes = next;
    if (!m) total = bytes.length;
    return true;
  };
  await more();
  if (String.fromCharCode(...bytes.subarray(0, 4)) !== 'AR2V') throw new Error('Not a Level II volume.');
  const blocks = [];
  let pos = 24;
  for (;;) {
    const view = new DataView(bytes.buffer);
    let added = false;
    while (pos + 4 <= bytes.length) {
      const size = Math.abs(view.getInt32(pos));
      if (!size || pos + 4 + size > bytes.length) break;
      const rec = bytes.subarray(pos + 4, pos + 4 + size);
      blocks.push(rec[0] === 0x42 && rec[1] === 0x5a && rec[2] === 0x68 ? bunzip(rec) : rec.slice());
      pos += 4 + size;
      added = true;
    }
    const done = bytes.length >= total && pos + 4 > bytes.length;
    if (added || done) {
      let vol = null;
      try {
        vol = indexBlocks(blocks, done);
      } catch (err) {
        if (done) throw err;
      }
      const pick = vol && choose(vol, done);
      if (pick) return { vol, pick };
      if (done) throw new Error('This product is not in this volume.');
    }
    if (!(await more())) {
      const vol = indexBlocks(blocks, true);
      const pick = choose(vol, true);
      if (!pick) throw new Error('This product is not in this volume.');
      return { vol, pick };
    }
  }
}

async function handle(msg) {
  if (msg.type === 'tilts') {
    const vol = await archiveVolume(msg.key);
    return { tilts: listTilts(vol, msg.moment) };
  }
  if (msg.type === 'sweep') {
    const { vol, pick } = await archiveSweep(msg.key, msg.moment, msg.tilt);
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
