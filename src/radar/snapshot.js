// Snapshot of the map exactly as it is on screen: basemap, radar, lightning,
// warning outlines and place names, drawn into one image. Station markers,
// popups and buttons are left out.
//
// Every layer is an image, a canvas or an SVG already positioned on the page,
// so each one is copied at its on-screen position, in stacking order, with its
// on-screen opacity. The basemap is drawn by WebGL (MapLibre), whose picture
// can only be read right after it draws, so it's asked to redraw once and
// copied at that moment.

const SKIP_PANES = new Set(['markerPane', 'shadowPane', 'tooltipPane', 'popupPane', 'overlayPane']);

function copyBasemaps(map) {
  const copies = new Map();
  const jobs = (map._wsBasemaps || []).map(
    (layer) =>
      new Promise((resolve) => {
        const m = layer.getMaplibreMap?.();
        if (!m) return resolve();
        const src = m.getCanvas();
        let done = false;
        const grab = () => {
          if (done) return;
          done = true;
          const c = document.createElement('canvas');
          c.width = src.width;
          c.height = src.height;
          try {
            c.getContext('2d').drawImage(src, 0, 0);
            copies.set(src, c);
          } catch {
            // leave this basemap layer out
          }
          resolve();
        };
        m.once('render', grab);
        m.triggerRepaint();
        setTimeout(grab, 2500);
      })
  );
  return Promise.all(jobs).then(() => copies);
}

function opacityOf(el, root) {
  let o = 1;
  for (let n = el; n && n !== root; n = n.parentElement) {
    const s = getComputedStyle(n);
    if (s.display === 'none' || s.visibility === 'hidden') return 0;
    o *= parseFloat(s.opacity);
  }
  return o;
}

async function svgImage(svg) {
  const clone = svg.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.removeAttribute('style'); // its on-page position is applied when drawing
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

// Station readings (temperature / wind numbers) are HTML labels, not images:
// draw each one as text at its on-screen spot, in its own color and size.
const TEXT_PANES = ['stationobs'];
function drawTextLabels(ctx, root, box, scale) {
  for (const name of TEXT_PANES) {
    for (const el of root.querySelectorAll(`.leaflet-${name}-pane .leaflet-marker-icon > div`)) {
      const r = el.getBoundingClientRect();
      if (r.right < box.left || r.left > box.right || r.bottom < box.top || r.top > box.bottom) continue;
      const s = getComputedStyle(el);
      ctx.save();
      ctx.globalAlpha = parseFloat(s.opacity) || 1;
      ctx.font = `${s.fontWeight} ${parseFloat(s.fontSize) * scale}px ${s.fontFamily}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const x = (r.left + r.width / 2 - box.left) * scale;
      const y = (r.top + r.height / 2 - box.top) * scale;
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 3 * scale;
      ctx.lineWidth = 3 * scale;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(el.textContent, x, y);
      ctx.fillStyle = s.color;
      ctx.fillText(el.textContent, x, y);
      ctx.restore();
    }
  }
}

// Returns { canvas, scale, toLatLng(x, y), toPoint(lat, lng) } where x, y are canvas pixels.
// toLatLng uses the view at capture time, so later map moves don't matter.
export async function snapshotMap(map, scale = 2) {
  const root = map.getContainer();
  const box = root.getBoundingClientRect();
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(box.width * scale);
  canvas.height = Math.round(box.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0b0f17';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const origin = map.getPixelBounds().min;
  const zoom = map.getZoom();
  const toLatLng = (x, y) => map.unproject(origin.add([x / scale, y / scale]), zoom);
  const toPoint = (lat, lng) => {
    const p = map.project([lat, lng], zoom).subtract(origin);
    return { x: p.x * scale, y: p.y * scale };
  };

  // Let map images that are still arriving finish (up to 3 seconds).
  await new Promise((r) => setTimeout(r, 60));
  for (let i = 0; i < 30 && [...root.querySelectorAll('.leaflet-pane img')].some((im) => !im.complete); i++) {
    await new Promise((r) => setTimeout(r, 100));
  }
  const gl = await copyBasemaps(map);
  const panes = Object.entries(map.getPanes())
    .filter(([name, el]) => !SKIP_PANES.has(name) && el.parentElement?.classList.contains('leaflet-map-pane'))
    .map(([, el]) => el)
    .sort((a, b) => (parseInt(getComputedStyle(a).zIndex, 10) || 0) - (parseInt(getComputedStyle(b).zIndex, 10) || 0));

  for (const pane of panes) {
    for (const el of pane.querySelectorAll('canvas, img, svg')) {
      if (el.tagName.toLowerCase() !== 'svg' && el.closest('svg')) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1 || r.right < box.left || r.left > box.right || r.bottom < box.top || r.top > box.bottom) continue;
      const alpha = opacityOf(el, root);
      if (alpha < 0.01) continue;
      let src = el;
      if (el.tagName === 'IMG') {
        if (!el.complete || !el.naturalWidth) continue;
      } else if (el.tagName === 'CANVAS') {
        if (gl.has(el)) src = gl.get(el);
        else if (el.getContext && el.classList.contains('maplibregl-canvas')) continue;
      } else {
        try {
          src = await svgImage(el);
        } catch {
          continue;
        }
      }
      ctx.globalAlpha = alpha;
      ctx.imageSmoothingEnabled = !el.classList.contains('ws-radar-crisp');
      ctx.drawImage(src, (r.left - box.left) * scale, (r.top - box.top) * scale, r.width * scale, r.height * scale);
    }
  }
  ctx.globalAlpha = 1;
  drawTextLabels(ctx, root, box, scale);
  return { canvas, scale, toLatLng, toPoint };
}
