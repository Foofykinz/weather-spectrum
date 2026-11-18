// Current temperatures at airport weather stations (ASOS) around a broadcast
// city, from the Iowa Environmental Mesonet. Real observations only: stations
// with no temperature, or a reading older than MAX_AGE, are left off.

import L from 'leaflet';
import { STATIONS } from '../radar/stations';

const IEM = 'https://mesonet.agron.iastate.edu/api/1/currents.geojson';
const TTL = 10 * 60e3; // re-download a state after this long
const MAX_AGE = 90 * 60e3;
const cache = new Map(); // state -> { at, promise }

function loadState(st) {
  const hit = cache.get(st);
  if (hit && Date.now() - hit.at < TTL) return hit.promise;
  const promise = fetch(`${IEM}?network=${st}_ASOS&minutes=90`)
    .then((r) => (r.ok ? r.json() : { features: [] }))
    .then((j) =>
      (j.features || [])
        .map((f) => ({ id: f.properties.station, lat: f.geometry?.coordinates?.[1], lon: f.geometry?.coordinates?.[0], temp: f.properties.tmpf, at: Date.parse(f.properties.utc_valid) }))
        .filter((o) => o.temp != null && Number.isFinite(o.lat) && Number.isFinite(o.lon))
    )
    .catch(() => {
      cache.delete(st);
      return [];
    });
  cache.set(st, { at: Date.now(), promise });
  return promise;
}

// States worth loading for a view centered on lat/lon: the city's own state
// and every state with a NEXRAD radar near the view (radars are spread out
// enough that this catches each state the view reaches).
function statesNear(city, halfLat, halfLon) {
  const set = new Set([city.state]);
  for (const s of STATIONS) {
    if (s.state.length === 2 && Math.abs(s.lat - city.lat) < halfLat + 1.5 && Math.abs(s.lon - city.lon) < halfLon + 1.5) set.add(s.state);
  }
  return [...set];
}

export async function tempsNear(city, halfLat, halfLon) {
  const lists = await Promise.all(statesNear(city, halfLat, halfLon).map(loadState));
  const now = Date.now();
  return lists.flat().filter((o) => now - o.at < MAX_AGE && Math.abs(o.lat - city.lat) < halfLat && Math.abs(o.lon - city.lon) < halfLon);
}

const colorOf = (t) => (t <= 20 ? '#c7d2fe' : t <= 32 ? '#7dd3fc' : t <= 50 ? '#86efac' : t <= 70 ? '#fde047' : t <= 85 ? '#fdba74' : '#fca5a5');

// Leaflet layer: one small temperature label per station, thinned out so no
// two are closer than `gap` pixels at `zoom`. The city's own spot is kept clear
// for the map label.
export function tempLayer(map, obs, zoom, gap = 70) {
  const placed = [];
  const group = L.layerGroup();
  for (const o of obs) {
    const p = map.project([o.lat, o.lon], zoom);
    if (placed.some((q) => Math.abs(q.x - p.x) < gap && Math.abs(q.y - p.y) < gap * 0.6)) continue;
    placed.push(p);
    const t = Math.round(o.temp);
    L.marker([o.lat, o.lon], {
      pane: 'temps',
      interactive: false,
      keyboard: false,
      icon: L.divIcon({
        className: '',
        iconSize: [0, 0],
        html: `<div style="transform:translate(-50%,-50%);font-weight:700;font-size:24px;line-height:1;color:${colorOf(t)};text-shadow:0 0 3px #000,0 0 3px #000,0 1px 2px #000;white-space:nowrap">${t}°</div>`,
      }),
    }).addTo(group);
  }
  return group;
}
