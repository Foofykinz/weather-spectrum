import { maplibregl, climStyle, setAreas, cameraFor } from './mapStyle';

// Post images for /tornado-season: the same tilted globe map, drawn off screen
// at the post's size, with a title strip ("Average Tornado Risk Area |
// December"), the Typical / Greater labels and a credit line.

export const CLIM_SIZES = [
  { id: 'square', label: 'Square', w: 1080, h: 1080 },
  { id: 'wide', label: 'Wide', w: 1200, h: 675 },
  { id: 'tall', label: 'Tall', w: 1080, h: 1350 },
];
const FONT = 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif';
const R = 2; // the map is drawn at half size, twice as sharp, so its names are readable
const CREDIT = 'Data: NOAA/NWS Storm Prediction Center reports, 1996-2025 · Map: OpenFreeMap, © OpenStreetMap';

const waitFor = (map, event, ms) =>
  new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    map.once(event, () => {
      clearTimeout(t);
      resolve();
    });
  });

function fitFont(ctx, text, weight, size, maxW, min) {
  let s = size;
  ctx.font = `${weight} ${s}px ${FONT}`;
  while (s > min && ctx.measureText(text).width > maxW) {
    s -= 1;
    ctx.font = `${weight} ${s}px ${FONT}`;
  }
  return s;
}

// Returns a canvas. title: "Average Tornado Risk Area". monthName: "December".
export async function renderClimPost({ size, month, colors, title, monthName }) {
  const { w: W, h: H } = size;
  const u = Math.min(W, H) / 1080;
  const head = Math.round(150 * u);
  const foot = Math.round(64 * u);
  const box = document.createElement('div');
  Object.assign(box.style, { position: 'fixed', left: '-10000px', top: '0', width: `${W / R}px`, height: `${H / R}px` });
  document.body.appendChild(box);
  const map = new maplibregl.Map({
    container: box,
    style: await climStyle(),
    pixelRatio: R,
    interactive: false,
    attributionControl: false,
    fadeDuration: 0,
    canvasContextAttributes: { preserveDrawingBuffer: true },
    center: [-92, 35],
    zoom: 3,
  });
  try {
    await waitFor(map, 'load', 20000);
    setAreas(map, month, colors);
    const cam = cameraFor(map, month, { top: head / R + 10, bottom: foot / R + 10, left: 16, right: 16 }, 0.2);
    if (cam) map.jumpTo(cam);
    await waitFor(map, 'idle', 20000);

    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d');
    ctx.drawImage(map.getCanvas(), 0, 0, W, H);

    // Typical / Greater labels where the page map shows them.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const [key, text] of [['typical', 'Typical'], ['greater', 'Greater']]) {
      const at = month?.labels?.[key];
      if (!at) continue;
      const p = map.project([at[1], at[0]]);
      const x = p.x * R;
      const y = p.y * R;
      ctx.font = `700 ${Math.round(32 * u)}px ${FONT}`;
      const tw = ctx.measureText(text).width + 26 * u;
      const th = 48 * u;
      ctx.fillStyle = colors[key];
      ctx.fillRect(x - tw / 2, y - th / 2, tw, th);
      ctx.lineWidth = 3 * u;
      ctx.strokeStyle = '#fff';
      ctx.strokeRect(x - tw / 2, y - th / 2, tw, th);
      ctx.fillStyle = '#fff';
      ctx.fillText(text, x, y + 1 * u);
    }

    // Title strip: colored title tab, then the month on white.
    ctx.textAlign = 'left';
    const pad = 22 * u;
    const th = 72 * u;
    const x0 = 36 * u;
    const y0 = 36 * u;
    const fs = fitFont(ctx, title, 700, Math.round(40 * u), W * 0.62, 20);
    const titleW = ctx.measureText(title).width + pad * 2;
    ctx.fillStyle = colors.typical;
    ctx.fillRect(x0, y0, titleW, th);
    ctx.fillStyle = '#fff';
    ctx.fillText(title, x0 + pad, y0 + th / 2 + 1 * u);
    ctx.font = `700 ${fs}px ${FONT}`;
    const monthW = ctx.measureText(monthName).width + pad * 2;
    ctx.fillStyle = '#fff';
    ctx.fillRect(x0 + titleW, y0, monthW, th);
    ctx.fillStyle = '#1f2937';
    ctx.fillText(monthName, x0 + titleW + pad, y0 + th / 2 + 1 * u);

    // Credit line.
    ctx.fillStyle = 'rgba(11,18,32,0.88)';
    ctx.fillRect(0, H - foot, W, foot);
    ctx.font = `700 ${Math.round(26 * u)}px ${FONT}`;
    ctx.fillStyle = '#fff';
    ctx.fillText('theweatherspectrum.com', 28 * u, H - foot / 2);
    const left = ctx.measureText('theweatherspectrum.com').width + 60 * u;
    ctx.textAlign = 'right';
    fitFont(ctx, CREDIT, 400, Math.round(17 * u), W - left - 28 * u, 9);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(CREDIT, W - 28 * u, H - foot / 2);
    return c;
  } finally {
    map.remove();
    box.remove();
  }
}
