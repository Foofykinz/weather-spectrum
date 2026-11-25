// Displacement maps for the liquid glass cards (components/LiquidGlass.jsx).
// Pure math, run in a worker (glassWorker.js) so the page never waits on it.

// Glass profile: height of the surface at t (0 = rim, 1 = a bezel's width in).
// Its slope is what bends the light; it is steepest at the rim. Looked up
// from a table (strength 0..1 at 256 steps) rather than computed per pixel.
const squircle = (t) => Math.pow(1 - Math.pow(1 - t, 4), 0.25);
const STRENGTH = (() => {
  const n = 256;
  const slope = (t) => (squircle(Math.min(1, t + 0.005)) - squircle(Math.max(0, t - 0.005))) / (Math.min(1, t + 0.005) - Math.max(0, t - 0.005));
  const peak = slope(0.04);
  return Float32Array.from({ length: n + 1 }, (_, i) => Math.min(1, slope(i / n) / peak));
})();

// The displacement map for a w x h element with corner radius r, as ImageData,
// and the largest displacement in px (the filter's scale). Only the rim band
// (a bezel's width in from the edge) is computed; everything inside it is
// "no displacement". The outward normal of a rounded rectangle is worked out
// directly: straight out on the sides, from the corner's center on the corners.
export function displacementMap(w, h, r) {
  const bezel = Math.max(4, Math.min(16, h * 0.42, w * 0.42));
  const maxPx = Math.max(3, Math.min(14, h * 0.32));
  const img = new ImageData(w, h);
  const d = img.data;
  new Uint32Array(d.buffer).fill(new Uint32Array(Uint8ClampedArray.of(128, 128, 128, 255).buffer)[0]);
  const hw = w / 2 - r;
  const hh = h / 2 - r;
  const band = Math.ceil(bezel) + 1;
  const pixel = (px, py) => {
    const x = px + 0.5 - w / 2;
    const y = py + 0.5 - h / 2;
    const qx = Math.abs(x) - hw;
    const qy = Math.abs(y) - hh;
    let nx;
    let ny;
    let dist; // distance in from the edge
    if (qx > 0 && qy > 0) {
      const len = Math.hypot(qx, qy) || 1;
      dist = r - len;
      nx = (Math.sign(x) * qx) / len;
      ny = (Math.sign(y) * qy) / len;
    } else if (qx > qy) {
      dist = r - qx;
      nx = Math.sign(x);
      ny = 0;
    } else {
      dist = r - qy;
      nx = 0;
      ny = Math.sign(y);
    }
    if (dist < 0 || dist >= bezel) return;
    const m = STRENGTH[Math.min(256, Math.round((dist / bezel) * 256))];
    const i = (py * w + px) * 4;
    d[i] = 128 + Math.round(nx * m * 127);
    d[i + 1] = 128 + Math.round(ny * m * 127);
  };
  for (let py = 0; py < h; py += 1) {
    if (py < band || py >= h - band) {
      for (let px = 0; px < w; px += 1) pixel(px, py);
    } else {
      for (let px = 0; px < band; px += 1) pixel(px, py);
      for (let px = Math.max(band, w - band); px < w; px += 1) pixel(px, py);
    }
  }
  return { img, scale: maxPx * 2 };
}

