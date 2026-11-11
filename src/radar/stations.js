// NEXRAD (WSR-88D) radar sites.
//
// The list is bundled with the app (about 7 KB) instead of downloaded on every
// visit: the network of radars rarely changes, and it saves a request on
// slow mobile connections. Regenerate it from the source URL in the JSON file
// if a radar is added or retired.

import raw from './data/nexrad-stations.json';

// Radar call signs add a regional prefix to the 3-letter id (KTLX, PAHG, TJUA...).
const ICAO_PREFIX = { AK: 'P', HI: 'P', GU: 'P', PR: 'T' };

export const STATIONS = raw.stations.map(([id, name, state, lat, lon]) => ({
  id, // 3-letter IEM id, e.g. "TLX" — what the data provider expects
  icao: (ICAO_PREFIX[state.trim()] || (state.trim() ? 'K' : 'R')) + id, // display label
  name,
  state: state.trim() || 'Intl',
  lat,
  lon,
}));

const byId = new Map(STATIONS.map((s) => [s.id, s]));

export function getStation(id) {
  return byId.get(id) || null;
}

function distanceKm(aLat, aLon, bLat, bLon) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

export function nearestStation(lat, lon) {
  let best = null;
  let bestKm = Infinity;
  for (const s of STATIONS) {
    const km = distanceKm(lat, lon, s.lat, s.lon);
    if (km < bestKm) {
      best = s;
      bestKm = km;
    }
  }
  return best;
}
