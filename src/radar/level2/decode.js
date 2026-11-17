// NEXRAD Level II (Archive II, message 31) decoder.
//
// Format reference: WSR-88D Interface Control Document for the Archive II /
// User (ICD 2620010) and the RDA/RPG ICD (2620002), message type 31
// "Digital Radar Data Generic Format".
//
// A volume file is a 24-byte header ("AR2V00xx.") followed by records, each a
// 4-byte length and a bzip2-compressed block of messages. Each message has a
// 12-byte channel header and a 16-byte message header; type 31 messages are
// variable length, all others occupy fixed 2432-byte frames.
//
// indexVolume() decompresses and indexes every radial (cheap); sweepMoment()
// then builds one tilt of one moment (REF, VEL, SW, ZDR, RHO) in the same
// layout as the Level III decoder, so drawing and tap-to-read work unchanged.
// Only 8-bit moments are supported; others are rejected rather than guessed.

import { bunzip } from './bunzip.js';

const CTM = 12;
const FRAME = 2432;
export const LEVEL2_MOMENTS = ['REF', 'VEL', 'SW ', 'ZDR', 'RHO'];
// ZDR is stored with 16-bit codes. It's re-coded to 8 bits at 1/16 dB
// steps (offset 128), the same precision as NOAA's Level III ZDR product.
const ZDR8 = { scale: 16, offset: 128 };
const usable = (moment, bits) => bits === 8 || (bits === 16 && moment === 'ZDR');

const str = (b, o, n) => String.fromCharCode(...b.subarray(o, o + n));

// Records in a file or a real-time chunk -> decompressed message blocks.
// A whole volume (or the first real-time chunk) starts with the 24-byte
// "AR2V" header; later real-time chunks are bare records.
export function recordsOf(input) {
  const file = input instanceof Uint8Array ? input : new Uint8Array(input);
  const fv = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const blocks = [];
  let o = str(file, 0, 4) === 'AR2V' ? 24 : 0;
  // Older archive files (inside .gz) hold the messages directly after the
  // header, with no compressed records: one raw block.
  if (o === 24 && file.length > 28 && fv.getInt32(24) === 0) return [file.subarray(24)];
  while (o + 4 <= file.length) {
    const size = Math.abs(fv.getInt32(o));
    if (!size || o + 4 + size > file.length) break;
    const rec = file.subarray(o + 4, o + 4 + size);
    blocks.push(str(rec, 0, 3) === 'BZh' ? bunzip(rec) : rec);
    o += 4 + size;
  }
  return blocks;
}

export function indexVolume(arrayBuffer) {
  if (str(new Uint8Array(arrayBuffer), 0, 4) !== 'AR2V') throw new Error('Not a Level II volume.');
  return indexBlocks(recordsOf(arrayBuffer));
}

// Index decompressed message blocks (in order) into cuts and radials.
// complete: false for a volume still being scanned; then every cut except
// the newest one is finished (cuts arrive one after another).
export function indexBlocks(blocks, complete = true) {
  const radials = [];
  let site = null;
  let vcp = null;
  let legacy = false;
  for (const b of blocks) {
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    let p = 0;
    while (p + CTM + 16 <= b.length) {
      const h = p + CTM;
      const sizeHw = v.getUint16(h);
      const type = b[h + 3];
      if (type === 31) {
        if (h + sizeHw * 2 > b.length) break; // cut off mid-message (still downloading)
        const m = h + 16;
        const nBlocks = v.getUint16(m + 30);
        const ptrs = {};
        for (let k = 0; k < nBlocks && k < 10; k++) {
          const off = v.getUint32(m + 32 + k * 4);
          if (!off) continue;
          const name = str(b, m + off + 1, 3);
          ptrs[name] = m + off;
        }
        if (ptrs.VOL && !site) {
          const q = ptrs.VOL;
          site = { lat: v.getFloat32(q + 8), lon: v.getFloat32(q + 12) };
          vcp = v.getUint16(q + 40);
        }
        radials.push({
          buf: b,
          view: v,
          time: (v.getUint16(m + 8) - 1) * 86400000 + v.getUint32(m + 4),
          az: v.getFloat32(m + 12),
          res: b[m + 20] === 1 ? 0.5 : 1,
          elevNum: b[m + 22],
          elev: v.getFloat32(m + 24),
          ptrs,
        });
        p = h + Math.max(sizeHw * 2, 16);
      } else {
        if (type === 1) legacy = true; // pre-2008 "digital radar data" message
        p += FRAME;
      }
    }
  }
  if (!site || !radials.length) {
    throw new Error(legacy ? 'This volume uses the older (pre-2008) Level II format, which isn’t supported yet.' : 'No radar data in this volume.');
  }

  // Cuts (elevation numbers) and what each contains.
  const cuts = new Map();
  for (const r of radials) {
    let c = cuts.get(r.elevNum);
    if (!c) cuts.set(r.elevNum, (c = { n: r.elevNum, radials: [], moments: new Set() }));
    c.radials.push(r);
    for (const k of Object.keys(r.ptrs)) if (LEVEL2_MOMENTS.includes(k)) c.moments.add(k);
  }
  for (const c of cuts.values()) {
    c.elevation = c.radials.reduce((s, r) => s + r.elev, 0) / c.radials.length;
    c.start = Math.min(...c.radials.map((r) => r.time));
  }
  const list = [...cuts.values()].sort((a, b) => a.n - b.n);
  // In a volume still being scanned, the newest cut is partial: leave it out.
  return { site, vcp, complete, cuts: complete ? list : list.slice(0, -1) };
}

// Moment block header (28 bytes), then the gate data.
function momentHeader(r, name) {
  const q = r.ptrs[name];
  if (q == null) return null;
  const v = r.view;
  return {
    q,
    gates: v.getUint16(q + 8),
    firstM: v.getUint16(q + 10), // range to the center of the first gate (m)
    stepM: v.getUint16(q + 12), // gate spacing (m)
    wordBits: r.buf[q + 19],
    scale: v.getFloat32(q + 20),
    offset: v.getFloat32(q + 24),
  };
}

// The tilts available for a moment: one cut per angle (0.1 deg). Where a
// volume has several cuts at the same angle (split cuts, SAILS rescans),
// use the one reaching farthest, and the newest of those.
export function tiltsFor(vol, moment) {
  const byAngle = new Map();
  for (const c of vol.cuts) {
    if (!c.moments.has(moment)) continue;
    const h = momentHeader(c.radials[0], moment);
    if (!h || !usable(moment, h.wordBits)) continue;
    const reach = h.firstM + h.gates * h.stepM;
    const key = c.elevation.toFixed(1);
    const best = byAngle.get(key);
    if (!best || reach > best.reach || (reach === best.reach && c.start > best.cut.start)) byAngle.set(key, { cut: c, reach });
  }
  return [...byAngle.entries()].map(([angle, { cut }]) => ({ tilt: angle, elevation: cut.elevation, n: cut.n })).sort((a, b) => a.elevation - b.elevation);
}

// One cut + moment in the Level III radial layout.
export function sweepMoment(vol, n, moment) {
  const cut = vol.cuts.find((c) => c.n === n);
  if (!cut) throw new Error('Tilt not in this volume.');
  const rads = cut.radials.filter((r) => r.ptrs[moment]).sort((a, b) => a.az - b.az);
  if (!rads.length) throw new Error(`No ${moment.trim()} data at this tilt.`);
  const h0 = momentHeader(rads[0], moment);
  if (!usable(moment, h0.wordBits)) throw new Error('Unsupported data size.');
  const wide = h0.wordBits === 16;
  const nbins = Math.max(...rads.map((r) => momentHeader(r, moment).gates));
  const nrad = rads.length;
  const data = new Uint8Array(nrad * nbins);
  const starts = new Float32Array(nrad);
  const deltas = new Float32Array(nrad);
  rads.forEach((r, i) => {
    const h = momentHeader(r, moment);
    if (!wide) data.set(r.buf.subarray(h.q + 28, h.q + 28 + h.gates), i * nbins);
    else {
      for (let g = 0; g < h.gates; g++) {
        const c = r.view.getUint16(h.q + 28 + g * 2);
        // codes 0 and 1 are flags (below threshold, range folded); keep them
        data[i * nbins + g] = c < 2 ? c : Math.max(2, Math.min(255, Math.round(((c - h.offset) / h.scale) * ZDR8.scale + ZDR8.offset)));
      }
    }
    starts[i] = (r.az - r.res / 2 + 360) % 360;
    deltas[i] = r.res;
  });
  return {
    product: 'L2',
    moment: moment.trim(),
    lat: vol.site.lat,
    lon: vol.site.lon,
    vcp: vol.vcp,
    scanTime: new Date(cut.start),
    elevation: cut.elevation,
    scale: wide ? ZDR8.scale : h0.scale,
    offset: wide ? ZDR8.offset : h0.offset,
    recoded: wide, // ZDR re-coded at 1/16 dB steps
    thresholds: [],
    // Bins are counted from the start edge of the first gate, in gate units.
    firstBin: (h0.firstM - h0.stepM / 2) / h0.stepM,
    binKm: h0.stepM / 1000,
    nbins,
    nrad,
    data,
    starts,
    deltas,
  };
}
