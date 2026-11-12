// Background worker: decompress + decode a Level III file and draw it, or
// redraw an already-decoded scan for the area on screen (sharp zoom).
// Runs off the main thread so the map stays smooth.

import { decodeLevel3 } from './decode';
import { buildLut, scanBounds, scanImageSize, renderBox } from './render';

function decodeAndDraw({ id, buffer, colors, maxSize }) {
  const t0 = performance.now();
  const dec = decodeLevel3(buffer);
  const t1 = performance.now();
  const bounds = scanBounds(dec);
  const { width, height } = scanImageSize(bounds, maxSize);
  const img = renderBox(dec, buildLut(dec, colors), bounds, width, height);
  const t2 = performance.now();
  self.postMessage(
    {
      id, ok: true,
      meta: {
        product: dec.product, lat: dec.lat, lon: dec.lon, vcp: dec.vcp, scanTime: dec.scanTime.getTime(),
        elevation: dec.elevation, scale: dec.scale, offset: dec.offset, thresholds: dec.thresholds, firstBin: dec.firstBin,
        nbins: dec.nbins, nrad: dec.nrad, binKm: dec.binKm,
      },
      data: dec.data, starts: dec.starts, deltas: dec.deltas,
      image: img,
      timings: { decodeMs: t1 - t0, renderMs: t2 - t1 },
    },
    [dec.data.buffer, dec.starts.buffer, dec.deltas.buffer, img.rgba.buffer]
  );
}

// Keep the last scan sent for view drawing, so panning doesn't resend it.
let viewScan = null; // { key, dec, lut }

function drawView({ id, key, scan, colors, bounds, width, height }) {
  if (scan) viewScan = { key, dec: scan, lut: buildLut(scan, colors) };
  if (!viewScan || viewScan.key !== key) {
    self.postMessage({ id, ok: false, error: 'missing-scan' });
    return;
  }
  const img = renderBox(viewScan.dec, viewScan.lut, bounds, width, height);
  self.postMessage({ id, ok: true, image: img }, [img.rgba.buffer]);
}

self.onmessage = (e) => {
  try {
    if (e.data.type === 'view') drawView(e.data);
    else decodeAndDraw(e.data);
  } catch (err) {
    self.postMessage({ id: e.data.id, ok: false, error: err.message });
  }
};
