import { displacementMap } from './glassMap';

// Makes one glass displacement map off the page's main thread: the pixels and
// the PNG encoding (which Chrome otherwise does on the main thread and which
// took most of a second for a page's worth of cards).
self.onmessage = async ({ data: { key, w, h, r } }) => {
  try {
    const { img, scale } = displacementMap(w, h, r);
    const canvas = new OffscreenCanvas(w, h);
    canvas.getContext('2d').putImageData(img, 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    self.postMessage({ key, blob, scale });
  } catch {
    self.postMessage({ key, failed: true });
  }
};
