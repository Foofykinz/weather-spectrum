import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { slateStyle, STYLE_URLS } from '../components/radar/VectorBasemap';

// The tornado season map's look, shared by the page map (ClimatologyMap) and
// its post images (climatology/post.js): the light map on a globe, with the
// month's "typical" and "greater" areas under the borders and names, seen
// tilted from the south.

maplibregl.setWorkerUrl(workerUrl);
export { maplibregl };
export const EMPTY = { type: 'FeatureCollection', features: [] };
export const PITCH = 38;
export const VIEW = { center: [-92.5, 35.2], zoom: 3.35, pitch: PITCH, bearing: 0 };
export const geo = (polys) => (polys?.length ? { type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: polys } } : EMPTY);

let base = null;
// The map style with the two area layers added (empty until setAreas).
export async function climStyle() {
  base ||= fetch(STYLE_URLS.light).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Map style returned ${r.status}`))));
  base.catch(() => {
    base = null; // try again next time
  });
  const style = slateStyle(structuredClone(await base));
  const at = style.layers.findIndex((l) => l.type === 'symbol' || l.id.startsWith('boundary'));
  const fill = (id) => ({ id, type: 'fill', source: id, paint: { 'fill-color': '#000', 'fill-opacity': 0.85, 'fill-antialias': true } });
  style.layers.splice(at, 0, fill('typical'), fill('greater'));
  style.sources.typical = { type: 'geojson', data: EMPTY };
  style.sources.greater = { type: 'geojson', data: EMPTY };
  style.projection = { type: 'globe' };
  return style;
}

export function setAreas(map, month, colors) {
  map.getSource('typical').setData(geo(month?.typical));
  map.getSource('greater').setData(geo(month?.greater));
  map.setPaintProperty('typical', 'fill-color', colors.typical);
  map.setPaintProperty('greater', 'fill-color', colors.greater);
}

// Camera framing the month's typical area, tilted. backoff: zoom out a little,
// since the tilt makes the near (south) side larger than the fit assumes.
export function cameraFor(map, month, padding, backoff) {
  const ring = (month?.typical || []).flatMap((p) => p[0]);
  if (!ring.length) return null;
  const lons = ring.map((p) => p[0]);
  const lats = ring.map((p) => p[1]);
  const cam = map.cameraForBounds(
    [
      [Math.min(...lons), Math.min(...lats)],
      [Math.max(...lons), Math.max(...lats)],
    ],
    { padding }
  );
  return cam && { center: cam.center, zoom: Math.min(5.2, cam.zoom - backoff), pitch: PITCH, bearing: 0 };
}
