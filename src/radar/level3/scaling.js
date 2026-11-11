// Data level -> physical value, per Level III product.
// Shared by the worker (coloring) and the map (tap to read), so both always agree.
// Parameters come from each file's own header (halfwords 31-46).
//
//  159 ZDR, 161 CC, 163 KDP: value = (level - offset) / scale, with float32
//      scale/offset; level 0 = below signal threshold, 1 = range folded.
//  134 Digital VIL (kg/m²): linear below a "log start" level, logarithmic
//      above; parameters stored as 16-bit custom floats. Level 0 = below
//      threshold, 1 = flagged (no data).
//  135 Enhanced Echo Tops (kft): value = (level & mask) / scale - offset; the
//      "topped" bit means the echo extends above the highest scanned tilt.
//      Masked level 0 = below threshold, 1 = bad data.

// 16-bit float used by Level III headers: 1 sign bit, 5 exponent bits, 10 fraction bits.
export function float16(v) {
  const sign = (v >> 15) & 1;
  const exp = (v >> 10) & 0x1f;
  const frac = v & 0x3ff;
  const x = exp ? 2 ** (exp - 16) * (1 + frac / 1024) : frac / 512;
  return sign ? -x : x;
}

export function makeScaler(m) {
  const t = m.thresholds;
  switch (m.product) {
    case 159:
    case 161:
    case 163:
      return {
        value: (n) => (n < 2 ? null : (n - m.offset) / m.scale),
        flag: (n) => (n === 0 ? 'below-threshold' : n === 1 ? 'range-folded' : null),
        topped: () => false,
      };
    case 134: {
      const linScale = float16(t[0]);
      const linOffset = float16(t[1]);
      const logStart = t[2];
      const logScale = float16(t[3]);
      const logOffset = float16(t[4]);
      return {
        value: (n) => (n < 2 ? null : n < logStart ? (n - linOffset) / linScale : Math.exp((n - logOffset) / logScale)),
        flag: (n) => (n === 0 ? 'below-threshold' : n === 1 ? 'no-data' : null),
        topped: () => false,
      };
    }
    case 135: {
      const [mask, scale, offset, toppedMask] = t;
      return {
        value: (n) => ((n & mask) < 2 ? null : (n & mask) / scale - offset),
        flag: (n) => ((n & mask) === 0 ? 'below-threshold' : (n & mask) === 1 ? 'no-data' : null),
        topped: (n) => (n & toppedMask) !== 0,
      };
    }
    default:
      throw new Error(`No scaling defined for product ${m.product}.`);
  }
}
