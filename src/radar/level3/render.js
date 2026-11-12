// Drawing a decoded Level III scan into an image (used by the worker).
//
// Each output pixel is placed in Web Mercator (the map's projection),
// converted to ground distance + azimuth from the radar, then to the beam's
// slant range, and colored by the exact range bin it falls in. No smoothing
// or interpolation: every pixel shows a real bin value.
//
// The same routine draws the whole scan (a fixed-size overview image) and,
// when zoomed in, just the area on screen at screen resolution, so bins
// stay sharp at any zoom.

import { buildAzimuthTable, slantRangeKm, boundsAround, EARTH_KM } from './geometry';
import { makeScaler } from './scaling';

const RAD = Math.PI / 180;
const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * RAD) / 2));
const invMercY = (y) => Math.atan(Math.sinh(y)) / RAD;

function hexToAbgr(hex) {
  const n = parseInt(hex.slice(1), 16);
  return (0xff << 24) | ((n & 0xff) << 16) | (n & 0xff00) | ((n >> 16) & 0xff);
}

// 256-entry color lookup: data level -> packed RGBA (0 = transparent).
// colors.belowFirstTransparent: values under the first band are not drawn
// (used for palettes whose legend starts at a fixed value).
export function buildLut(dec, colors) {
  const lut = new Uint32Array(256);
  const scaler = makeScaler(dec);
  const stops = colors.stops;
  for (let n = 0; n < 256; n++) {
    if (scaler.flag(n) === 'range-folded') {
      if (colors.rangeFolded) lut[n] = hexToAbgr(colors.rangeFolded);
      continue;
    }
    const raw = scaler.value(n);
    if (raw == null) continue; // below threshold / no data: transparent
    const v = raw * (colors.multiplier || 1); // e.g. velocity m/s -> knots for the NWS table
    if (colors.belowFirstTransparent && v < stops[0][0]) continue;
    let c = stops[0][1];
    for (let i = 0; i < stops.length && stops[i][0] <= v; i++) c = stops[i][1];
    lut[n] = hexToAbgr(c);
  }
  return lut;
}

// Lat/lon box holding the whole scan.
export function scanBounds(dec) {
  const maxSlant = (dec.firstBin + dec.nbins) * dec.binKm;
  return boundsAround(dec.lat, dec.lon, maxSlant + 1);
}

// Overview image size for the whole scan, longest side = maxSize.
export function scanImageSize(bounds, maxSize) {
  const [[south, west], [north, east]] = bounds;
  const xSpan = (east - west) * RAD;
  const ySpan = mercY(north) - mercY(south);
  return xSpan >= ySpan
    ? { width: maxSize, height: Math.round((maxSize * ySpan) / xSpan) }
    : { width: Math.round((maxSize * xSpan) / ySpan), height: maxSize };
}

// Draw the scan into a width x height image covering `bounds` ([[s, w], [n, e]]).
export function renderBox(dec, lut, bounds, width, height) {
  const maxSlant = (dec.firstBin + dec.nbins) * dec.binKm;
  const maxGround = maxSlant + 1; // ground distance is never larger than slant range
  const [[south, west], [north, east]] = bounds;
  const yN = mercY(north);
  const ySpan = yN - mercY(south);

  const azTable = dec.azTable || buildAzimuthTable(dec.starts, dec.deltas);
  // Ground distance (10 m steps) -> range bin index, via the beam model.
  const binTable = new Int16Array(Math.ceil(maxGround * 100) + 1);
  for (let i = 0; i < binTable.length; i++) {
    const b = Math.floor(slantRangeKm(i / 100, dec.elevation) / dec.binKm) - dec.firstBin;
    binTable[i] = b >= 0 && b < dec.nbins ? b : -1;
  }

  const p1 = dec.lat * RAD;
  const sinP1 = Math.sin(p1);
  const cosP1 = Math.cos(p1);
  const cosDl = new Float64Array(width);
  const sinDl = new Float64Array(width);
  for (let i = 0; i < width; i++) {
    const lon = west + ((i + 0.5) / width) * (east - west);
    const dl = (lon - dec.lon) * RAD;
    cosDl[i] = Math.cos(dl);
    sinDl[i] = Math.sin(dl);
  }

  const out = new Uint32Array(width * height);
  const { data, nbins } = dec;
  for (let j = 0; j < height; j++) {
    const lat = invMercY(yN - ((j + 0.5) / height) * ySpan);
    const p2 = lat * RAD;
    const sinP2 = Math.sin(p2);
    const cosP2 = Math.cos(p2);
    const a = sinP1 * sinP2;
    const b = cosP1 * cosP2;
    const c = cosP1 * sinP2;
    const d = sinP1 * cosP2;
    const row = j * width;
    for (let i = 0; i < width; i++) {
      const cosc = a + b * cosDl[i];
      const km = EARTH_KM * Math.acos(cosc > 1 ? 1 : cosc);
      if (km >= maxGround) continue;
      const bin = binTable[(km * 100) | 0];
      if (bin < 0) continue;
      let az = Math.atan2(sinDl[i] * cosP2, c - d * cosDl[i]) / RAD;
      if (az < 0) az += 360;
      const rad = azTable[((az * 10) | 0) % 3600];
      if (rad < 0) continue;
      const level = data[rad * nbins + bin];
      if (level) out[row + i] = lut[level];
    }
  }
  return { rgba: new Uint8ClampedArray(out.buffer), width, height, bounds };
}
