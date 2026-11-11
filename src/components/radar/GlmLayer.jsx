import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { createGlmStore, GLM_AGES, GLM_ATTRIBUTION, GLM_WINDOW_MS } from '../../radar/providers/glm';

// Draws GLM flash locations on one canvas over the radar (cheap even with
// thousands of flashes), colored and faded by age. Redrawn on pan/zoom and as
// flashes age.
const FlashCanvas = L.Layer.extend({
  initialize() {
    this._flashes = [];
  },
  onAdd(map) {
    this._map = map;
    this._canvas = L.DomUtil.create('canvas', 'ws-glm-canvas');
    this._canvas.style.pointerEvents = 'none';
    map.getPane('lightning').appendChild(this._canvas);
    map.on('moveend zoomend resize viewreset', this._reset, this);
    map.on('zoomstart', this._hide, this);
    this._reset();
  },
  onRemove(map) {
    map.off('moveend zoomend resize viewreset', this._reset, this);
    map.off('zoomstart', this._hide, this);
    this._canvas.remove();
  },
  setFlashes(flashes) {
    this._flashes = flashes;
    this._draw();
  },
  _hide() {
    this._canvas.style.visibility = 'hidden';
  },
  _reset() {
    const size = this._map.getSize();
    const dpr = window.devicePixelRatio || 1;
    this._canvas.width = size.x * dpr;
    this._canvas.height = size.y * dpr;
    this._canvas.style.width = `${size.x}px`;
    this._canvas.style.height = `${size.y}px`;
    L.DomUtil.setPosition(this._canvas, this._map.containerPointToLayerPoint([0, 0]));
    this._canvas.style.visibility = '';
    this._draw();
  },
  _draw() {
    if (!this._map) return;
    const ctx = this._canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
    const bounds = this._map.getBounds().pad(0.05);
    const now = Date.now();
    const r = 4; // half-size of the "+" mark, px
    ctx.lineCap = 'round';
    for (const [lat, lon, t] of this._flashes) {
      const ageMin = (now - t) / 60000;
      if (ageMin > 15 || !bounds.contains([lat, lon])) continue;
      const cls = GLM_AGES.find((a) => ageMin < a.maxMin) || GLM_AGES[GLM_AGES.length - 1];
      const p = this._map.latLngToContainerPoint([lat, lon]);
      ctx.globalAlpha = cls.alpha;
      // dark outline, then colored cross
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(p.x - r, p.y); ctx.lineTo(p.x + r, p.y);
      ctx.moveTo(p.x, p.y - r); ctx.lineTo(p.x, p.y + r);
      ctx.stroke();
      ctx.strokeStyle = cls.color;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },
});

// The Worker publishes new flashes once a minute, at the top of each minute.
// Poll shortly after each expected publish (processing takes a few seconds and
// the edge cache holds the index for up to 10 s) instead of on a fixed timer.
const PUBLISH_INTERVAL_MS = 60000;
const PUBLISH_SETTLE_MS = 12000;
const FALLBACK_POLL_MS = 30000; // when the Worker is behind or a check fails
const REDRAW_MS = 15000;

function nextPollDelay(generated) {
  if (!generated) return FALLBACK_POLL_MS;
  const due = generated.getTime() + PUBLISH_INTERVAL_MS + PUBLISH_SETTLE_MS;
  const wait = due - Date.now();
  // A publish older than expected means the Worker is behind: check more often.
  return wait > 5000 && wait <= PUBLISH_INTERVAL_MS + PUBLISH_SETTLE_MS ? wait : FALLBACK_POLL_MS;
}

export default function GlmLayer({ onStatus }) {
  const map = useMap();
  const statusCb = useRef(onStatus);
  statusCb.current = onStatus;

  if (!map.getPane('lightning')) {
    const pane = map.createPane('lightning');
    pane.style.zIndex = '420'; // between radar (350) and labels (450)
    pane.style.pointerEvents = 'none';
  }

  useEffect(() => {
    const layer = new FlashCanvas().addTo(map);
    const store = createGlmStore();
    let cancelled = false;
    let timer = null;
    let controller = null;
    let last = null;

    const check = async () => {
      clearTimeout(timer);
      controller?.abort();
      controller = new AbortController();
      let delay = FALLBACK_POLL_MS;
      try {
        const s = await store.refresh(controller.signal);
        if (cancelled) return;
        last = s;
        layer.setFlashes(s.flashes);
        const recent = s.flashes.filter((f) => Date.now() - f[2] <= GLM_WINDOW_MS).length;
        statusCb.current?.({ ...s, count: recent, error: null, checkedAt: new Date() });
        delay = nextPollDelay(s.generated);
      } catch (err) {
        if (cancelled || err.name === 'AbortError') return;
        statusCb.current?.((prev) => ({ ...(prev || {}), error: err, checkedAt: new Date() }));
      }
      if (!cancelled && !document.hidden) timer = setTimeout(check, delay);
    };

    // Keep fading current between polls.
    const redraw = setInterval(() => last && layer.setFlashes(last.flashes), REDRAW_MS);
    const onVisibility = () => {
      if (document.hidden) clearTimeout(timer);
      else check();
    };

    map.attributionControl?.addAttribution(GLM_ATTRIBUTION);
    check();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearInterval(redraw);
      controller?.abort();
      document.removeEventListener('visibilitychange', onVisibility);
      map.removeLayer(layer);
      map.attributionControl?.removeAttribution(GLM_ATTRIBUTION);
      statusCb.current?.(null);
    };
  }, [map]);

  return null;
}
