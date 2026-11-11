// Minimal NEXRAD Level III decoder for "digital radial" products
// (packet code 16), e.g. 161 Correlation Coefficient, 159 ZDR, 163 KDP.
//
// Format reference: WSR-88D RPG-to-Class-1-User ICD (2620001). Only what the
// first dual-pol products need is implemented; anything else is rejected
// rather than guessed.

// 'bz2' is a CommonJS package; the default import works in both Vite and Node.
import bz2 from 'bz2';

const { decompress } = bz2;

// Range-bin length (km) for the products we support:
// dual-pol products 0.25 km to 300 km; Digital VIL / Enhanced Echo Tops 1 km.
const BIN_KM = { 153: 0.25, 154: 0.25, 159: 0.25, 161: 0.25, 163: 0.25, 134: 1, 135: 1 };

export function decodeLevel3(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);

  // Files start with an optional text (WMO) header; the binary message header
  // is the 18 bytes before the first -1 (0xFFFF) divider.
  let mh = -1;
  for (let i = 0; i < Math.min(bytes.length - 1, 200); i++) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xff) { mh = i - 18; break; }
  }
  if (mh < 0) throw new Error('Not a Level III product (no header found).');
  const hw = (n) => view.getInt16(mh + (n - 1) * 2);      // halfword n, 1-based
  const uhw = (n) => view.getUint16(mh + (n - 1) * 2);

  const product = hw(16);
  if (!(product in BIN_KM)) throw new Error(`Unsupported Level III product ${product}.`);

  const lat = view.getInt32(mh + 20) / 1000;
  const lon = view.getInt32(mh + 24) / 1000;
  const vcp = hw(18);
  const scanDate = uhw(21);                                 // days since 1970-01-01 (day 1 = 1 Jan 1970)
  const scanSecs = view.getUint32(mh + 42);                 // seconds after midnight UTC
  const scanTime = new Date(((scanDate - 1) * 86400 + scanSecs) * 1000);
  // Halfword 30 is the elevation angle for single-tilt products. Volume products
  // (134 Digital VIL, 135 Enhanced Echo Tops) combine all tilts and use that
  // halfword for something else, so report 0 = "no single tilt".
  const elevation = product === 134 || product === 135 ? 0 : hw(30) / 10;
  const scale = view.getFloat32(mh + 60);                   // halfwords 31-32 (dual-pol products)
  const offset = view.getFloat32(mh + 64);                  // halfwords 33-34 (dual-pol products)
  const thresholds = Array.from({ length: 16 }, (_, i) => uhw(31 + i)); // raw halfwords 31-46
  const compression = hw(51);
  const symOffset = view.getUint32(mh + 108) * 2;           // halfwords 55-56, in halfwords

  let sym = bytes.subarray(mh + symOffset);
  if (compression === 1) sym = decompress(sym, false);
  else if (compression !== 0) throw new Error(`Unsupported compression ${compression}.`);
  const sv = new DataView(sym.buffer, sym.byteOffset, sym.byteLength);

  // Symbology block header (10 bytes) + layer header (6 bytes), then packet.
  let p = 16;
  if (sv.getUint16(p) !== 16) throw new Error(`Unexpected packet ${sv.getUint16(p)}.`);
  const firstBin = sv.getInt16(p + 2);
  const nbins = sv.getInt16(p + 4);
  const nrad = sv.getInt16(p + 12);
  p += 14;

  const data = new Uint8Array(nrad * nbins);
  const starts = new Float32Array(nrad);
  const deltas = new Float32Array(nrad);
  for (let r = 0; r < nrad; r++) {
    const n = sv.getInt16(p);
    starts[r] = sv.getInt16(p + 2) / 10;
    deltas[r] = sv.getInt16(p + 4) / 10;
    data.set(sym.subarray(p + 6, p + 6 + Math.min(n, nbins)), r * nbins);
    p += 6 + n + (n % 2);
  }

  return {
    product, lat, lon, vcp, scanTime, elevation, scale, offset, thresholds,
    firstBin, nbins, nrad, binKm: BIN_KM[product], data, starts, deltas,
  };
}
