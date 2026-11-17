// Background worker for Level II: download a volume, decompress and index it,
// then hand out single tilts of single moments (drawn as an overview image
// too, for browsers without WebGL2 and for the tap readout's data).
// The last two volumes are kept so switching tilts or products is instant.

import { indexVolume, tiltsFor, sweepMoment } from './decode';
import { buildLut, scanBounds, scanImageSize, renderBox } from '../level3/render';

const BUCKET = 'https://unidata-nexrad-level2.s3.amazonaws.com';
const volumes = new Map(); // key -> Promise<volume>

function volume(key) {
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

async function handle(msg) {
  const vol = await volume(msg.key);
  const tilts = tiltsFor(vol, msg.moment);
  if (msg.type === 'tilts') return { tilts: tilts.map(({ tilt, elevation }) => ({ tilt, elevation })) };
  if (!tilts.length) throw new Error('This product is not in the latest volume.');
  const pick = tilts.find((t) => t.tilt === msg.tilt) || tilts[0];
  const dec = sweepMoment(vol, pick.n, msg.moment);
  const bounds = scanBounds(dec);
  const { width, height } = scanImageSize(bounds, msg.maxSize);
  const image = renderBox(dec, buildLut(dec, msg.colors), bounds, width, height);
  const { data, starts, deltas, ...meta } = dec;
  return { meta: { ...meta, scanTime: dec.scanTime.getTime(), tilt: pick.tilt }, data, starts, deltas, image, transfer: [data.buffer, starts.buffer, deltas.buffer, image.rgba.buffer] };
}

self.onmessage = async (e) => {
  try {
    const { transfer = [], ...out } = await handle(e.data);
    self.postMessage({ id: e.data.id, ok: true, ...out }, transfer);
  } catch (err) {
    self.postMessage({ id: e.data.id, ok: false, error: err.message });
  }
};
