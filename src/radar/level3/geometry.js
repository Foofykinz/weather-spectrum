// Radar geometry shared by the decoder worker (drawing) and the map (tap to read).
//
// Radar range bins are measured along the tilted beam ("slant range"), while
// the map measures distance along the ground. We convert between them with
// the standard 4/3-effective-Earth-radius beam model used by radar software,
// so each bin is drawn where it was actually sampled.

export const EARTH_KM = 6371;
const KE_A = (4 / 3) * EARTH_KM; // effective Earth radius for beam propagation
const RAD = Math.PI / 180;

// Great-circle ground distance (km) and azimuth (degrees clockwise from north)
// from the radar to a point.
export function groundDistAz(radarLat, radarLon, lat, lon) {
  const p1 = radarLat * RAD;
  const p2 = lat * RAD;
  const dl = (lon - radarLon) * RAD;
  const cosc = Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dl);
  const km = EARTH_KM * Math.acos(Math.min(1, Math.max(-1, cosc)));
  let az = Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)) / RAD;
  if (az < 0) az += 360;
  return { km, az };
}

// Ground distance -> slant range along a beam at elevation `elevDeg` (km).
export function slantRangeKm(groundKm, elevDeg) {
  const phi = groundKm / KE_A;
  return (KE_A * Math.sin(phi)) / Math.cos(elevDeg * RAD + phi);
}

// Height of the beam center above the radar at a given slant range (km).
export function beamHeightKm(slantKm, elevDeg) {
  return Math.sqrt(slantKm * slantKm + KE_A * KE_A + 2 * slantKm * KE_A * Math.sin(elevDeg * RAD)) - KE_A;
}

// Lat/lon box that contains everything within `km` of the radar.
export function boundsAround(lat, lon, km) {
  const dLat = km / 111.2;
  const edgeLat = Math.min(89, Math.abs(lat) + dLat);
  const dLon = km / (111.32 * Math.cos(edgeLat * RAD));
  return [[lat - dLat, lon - dLon], [lat + dLat, lon + dLon]];
}

// Map an azimuth to the radial that covers it, at 0.1° resolution.
export function buildAzimuthTable(starts, deltas) {
  const table = new Int16Array(3600).fill(-1);
  for (let r = 0; r < starts.length; r++) {
    const steps = Math.max(1, Math.round(deltas[r] * 10));
    const first = Math.round(starts[r] * 10);
    for (let k = 0; k < steps; k++) table[(first + k) % 3600] = r;
  }
  return table;
}
