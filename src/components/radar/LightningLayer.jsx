import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

// Lightning overlay: NOAA nowCOAST "Lightning Strike Density".
//
// What it is (from the service's own description): density of lightning
// detected by ground-based networks (U.S. NLDN and GLD360), including
// cloud-to-ground and cloud lightning, accumulated over 15-minute periods on
// an 8 x 8 km grid, updated about every 15 minutes. NOAA distributes it as a
// derived product appropriate for public distribution.
//
// What it is NOT: individual strike locations, and not GOES GLM data.
//
// The newest 15-minute period is drawn at full strength and the period before
// it faded, so recent activity stands out from older activity.

const NOWCOAST = 'https://nowcoast.noaa.gov/geoserver/lightning_detection/ows';
const LAYER = 'ldn_lightning_strike_density';
const POLL_MS = 5 * 60 * 1000;
// Coverage stated by NOAA: 25°S-80°N, 110°E eastward to 0°. We request the Americas part.
const BOUNDS = L.latLngBounds([[-25, -180], [80, 0]]);

export const LIGHTNING_ATTRIBUTION =
  'Lightning: <a href="https://nowcoast.noaa.gov/" target="_blank" rel="noopener noreferrer">NOAA nowCOAST</a> (NLDN/GLD360-derived)';

async function fetchTimes(signal) {
  const res = await fetch(`${NOWCOAST}?service=WMS&version=1.3.0&request=GetCapabilities`, { signal });
  if (!res.ok) throw new Error(`Lightning service returned ${res.status}.`);
  const doc = new DOMParser().parseFromString(await res.text(), 'text/xml');
  const layer = [...doc.getElementsByTagName('Layer')].find(
    (el) => el.getElementsByTagName('Name')[0]?.textContent === LAYER
  );
  const dim = layer && [...layer.getElementsByTagName('Dimension')].find((d) => d.getAttribute('name') === 'time');
  const times = (dim?.textContent || '').split(',').map((s) => new Date(s.trim())).filter((d) => !Number.isNaN(d.getTime()));
  if (!times.length) throw new Error('Lightning service listed no times.');
  times.sort((a, b) => a - b);
  return times.slice(-2); // [previous, newest]
}

function wmsLayer(time, opacity) {
  return L.tileLayer.wms(NOWCOAST, {
    layers: LAYER,
    format: 'image/png',
    transparent: true,
    version: '1.3.0',
    time: time.toISOString(),
    pane: 'lightning',
    opacity,
    tileSize: 512,
    bounds: BOUNDS,
    updateWhenIdle: true,
    keepBuffer: 1,
    crossOrigin: true,
  });
}

export default function LightningLayer({ onStatus }) {
  const map = useMap();
  const statusCb = useRef(onStatus);
  statusCb.current = onStatus;

  // Pane between the radar (350) and labels (450).
  if (!map.getPane('lightning')) {
    const pane = map.createPane('lightning');
    pane.style.zIndex = '420';
    pane.style.pointerEvents = 'none';
  }

  useEffect(() => {
    let cancelled = false;
    let timer = null;
    let controller = null;
    let layers = [];
    let shownNewest = null;

    const clear = () => {
      layers.forEach((l) => map.removeLayer(l));
      layers = [];
    };

    const check = async () => {
      clearTimeout(timer);
      controller?.abort();
      controller = new AbortController();
      try {
        const times = await fetchTimes(controller.signal);
        if (cancelled) return;
        const newest = times[times.length - 1];
        if (shownNewest?.getTime() !== newest.getTime()) {
          const next = [];
          if (times.length > 1) next.push(wmsLayer(times[0], 0.35));
          next.push(wmsLayer(newest, 0.95));
          next.forEach((l) => l.addTo(map));
          const old = layers;
          layers = next;
          // Remove the previous set once the new newest period has drawn.
          next[next.length - 1].once('load', () => old.forEach((l) => map.removeLayer(l)));
          setTimeout(() => old.forEach((l) => map.hasLayer(l) && map.removeLayer(l)), 8000);
          shownNewest = newest;
        }
        statusCb.current?.({ newest, previous: times.length > 1 ? times[0] : null, error: null, checkedAt: new Date() });
      } catch (err) {
        if (cancelled || err.name === 'AbortError') return;
        statusCb.current?.((s) => ({ ...(s || {}), error: err, checkedAt: new Date() }));
      }
      if (!cancelled && !document.hidden) timer = setTimeout(check, POLL_MS);
    };

    const onVisibility = () => {
      if (document.hidden) clearTimeout(timer);
      else check();
    };

    map.attributionControl?.addAttribution(LIGHTNING_ATTRIBUTION);
    check();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener('visibilitychange', onVisibility);
      clear();
      map.attributionControl?.removeAttribution(LIGHTNING_ATTRIBUTION);
      statusCb.current?.(null);
    };
  }, [map]);

  return null;
}
