// Storm attributes from the NWS radar algorithms (storm tracking, hail
// detection, mesocyclone detection, tornado vortex signature), for every
// tracked storm in the country, as collected by the Iowa Environmental
// Mesonet from the NOAAPort Level III feed.
//   live:  /geojson/nexrad_attr.geojson         (refreshed every 2 minutes here)
//   past:  /geojson/nexrad_attr.py?valid=<time> (the storms at that time)
// These are automated radar detections, not warnings or observations.

const IEM = 'https://mesonet.agron.iastate.edu';
const POLL_MS = 120000;
const KT_TO_MPH = 1.15078;

export const STORMS_ATTRIBUTION =
  'Storm markers: NWS radar algorithms via <a href="https://mesonet.agron.iastate.edu/" target="_blank" rel="noopener">IEM</a>';

// Rank thresholds: the NWS mesocyclone detection algorithm's strength rank
// runs from weak (1) upward; 5+ is a mesocyclone worth showing.
export const MESO_MIN_RANK = 5;
export const HAIL_MIN_IN = 0.75;

function storm(f) {
  const p = f.properties;
  const meso = p.meso && p.meso !== 'NONE' ? Number(p.meso) : null;
  const moving = p.sknt > 0;
  return {
    key: `${p.nexrad}.${p.storm_id}`,
    radar: p.nexrad,
    id: p.storm_id,
    lon: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
    range: p.range, // nautical miles from the radar
    tvs: p.tvs === 'TVS' ? 'TVS' : p.tvs === 'ETVS' ? 'ETVS' : null,
    meso: Number.isFinite(meso) ? meso : null,
    hail: p.max_size > 0.01 ? p.max_size : 0,
    posh: p.posh,
    poh: p.poh,
    top: p.top, // thousands of feet
    vil: p.vil,
    maxDbz: p.max_dbz,
    toward: moving ? (p.drct + 180) % 360 : null, // the feed gives the direction it's moving FROM
    mph: moving ? Math.round(p.sknt * KT_TO_MPH) : 0,
    valid: new Date(p.valid),
  };
}

export const isNotable = (s) => !!s.tvs || (s.meso ?? 0) >= MESO_MIN_RANK || s.hail >= HAIL_MIN_IN;

// The same storm is often seen by two or three radars. Of detections within
// ~8 km of each other, keep one whole detection, exactly as that radar
// reported it: the most serious one (TVS, then rotation, then hail), and the
// closest radar among equals. Nothing is combined across radars.
const severity = (s) => (s.tvs ? 3000 : 0) + (s.meso ?? 0) * 10 + s.hail;
function dedupe(list) {
  const out = [];
  for (const s of [...list].sort((a, b) => severity(b) - severity(a) || a.range - b.range)) {
    if (!out.some((o) => Math.abs(o.lat - s.lat) < 0.07 && Math.abs(o.lon - s.lon) < 0.09)) out.push(s);
  }
  return out;
}

async function load(url, signal) {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`Storm data returned ${r.status}`);
  const j = await r.json();
  return (j.features || []).filter((f) => f.geometry?.coordinates).map(storm).filter(isNotable);
}

// Storms for display. radar: a 3-letter id to show only that radar's detections
// (single-radar view), or null for the whole country (deduplicated).
export function selectStorms(all, radar) {
  if (!all) return [];
  return radar ? all.filter((s) => s.radar === radar) : dedupe(all);
}

// ---- live: one shared poller for the whole page
let live = null;
const listeners = new Set();
let timer = 0;
async function poll() {
  try {
    live = { storms: await load(`${IEM}/geojson/nexrad_attr.geojson`), at: new Date() };
  } catch (err) {
    live = { ...(live || { storms: [] }), error: err };
  }
  listeners.forEach((fn) => fn(live));
}
export function subscribeStorms(fn) {
  listeners.add(fn);
  if (live) fn(live);
  if (listeners.size === 1) {
    poll();
    timer = setInterval(poll, POLL_MS);
  }
  return () => {
    listeners.delete(fn);
    if (!listeners.size) clearInterval(timer);
  };
}

// ---- past / loop frames: storms at a given time (cached per minute)
const pastCache = new Map(); // minute -> Promise
const ready = new Map(); // minute -> storms (once loaded), for drawing without a wait
const minuteOf = (t) => new Date(Math.floor(t.getTime() / 60000) * 60000).toISOString().slice(0, 16) + 'Z';
export const stormsReady = (t) => ready.get(minuteOf(t));
export function stormsAt(t) {
  const minute = minuteOf(t);
  if (!pastCache.has(minute)) {
    pastCache.set(
      minute,
      load(`${IEM}/geojson/nexrad_attr.py?valid=${minute}`).then(
        (storms) => {
          ready.set(minute, storms);
          if (ready.size > 40) ready.delete(ready.keys().next().value);
          return storms;
        },
        (err) => {
          pastCache.delete(minute);
          throw err;
        }
      )
    );
    if (pastCache.size > 40) pastCache.delete(pastCache.keys().next().value);
  }
  return pastCache.get(minute);
}

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export const compassOf = (deg) => COMPASS[Math.round(deg / 22.5) % 16];

// Point `minutes` ahead along the storm's motion (flat-earth is fine at this scale).
export function aheadOf(s, minutes) {
  const km = (s.mph * 1.609344 * minutes) / 60;
  const rad = (s.toward * Math.PI) / 180;
  return [s.lat + (km * Math.cos(rad)) / 111.32, s.lon + (km * Math.sin(rad)) / (111.32 * Math.cos((s.lat * Math.PI) / 180))];
}
