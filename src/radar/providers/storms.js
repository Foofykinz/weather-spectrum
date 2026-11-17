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

// ---- one radar over a time span (loops and replays on a single radar): one
// small CSV from IEM instead of a nationwide lookup per frame.
const spanCache = new Map(); // `${radar}|${sts}|${ets}` -> Promise<[{ valid, storms }]>
const stamp = (d) => d.toISOString().slice(0, 16) + 'Z';
export function radarStormHistory(radar, start, end) {
  const sts = stamp(new Date(start.getTime() - 15 * 60e3));
  const ets = stamp(new Date(end.getTime() + 60e3));
  const id = `${radar}|${sts}|${ets}`;
  if (!spanCache.has(id)) {
    const url = `${IEM}/cgi-bin/request/gis/nexrad_storm_attrs.py?fmt=csv&radar=${radar}&sts=${sts}&ets=${ets}`;
    spanCache.set(
      id,
      fetch(url)
        .then((r) => {
          if (!r.ok) throw new Error(`Storm data returned ${r.status}`);
          return r.text();
        })
        .then((csv) => {
          const [head, ...rows] = csv.trim().split('\n');
          const cols = head.split(',');
          const at = (row, name) => row[cols.indexOf(name)];
          const byTime = new Map();
          for (const line of rows) {
            const row = line.split(',');
            const v = at(row, 'VALID');
            const valid = new Date(Date.UTC(+v.slice(0, 4), +v.slice(4, 6) - 1, +v.slice(6, 8), +v.slice(8, 10), +v.slice(10, 12)));
            const s = storm({
              geometry: { coordinates: [+at(row, 'LON'), +at(row, 'LAT')] },
              properties: {
                nexrad: at(row, 'NEXRAD'), storm_id: at(row, 'STORM_ID'), azimuth: +at(row, 'AZIMUTH'), range: +at(row, 'RANGE'),
                tvs: at(row, 'TVS'), meso: at(row, 'MESO'), posh: +at(row, 'POSH'), poh: +at(row, 'POH'), max_size: +at(row, 'MAX_SIZE'),
                vil: +at(row, 'VIL'), max_dbz: +at(row, 'MAX_DBZ'), top: +at(row, 'TOP'), drct: +at(row, 'DRCT'), sknt: +at(row, 'SKNT'),
                valid: valid.toISOString(),
              },
            });
            if (!isNotable(s)) continue;
            if (!byTime.has(valid.getTime())) byTime.set(valid.getTime(), []);
            byTime.get(valid.getTime()).push(s);
          }
          return [...byTime.entries()].sort((a, b) => a[0] - b[0]).map(([t, storms]) => ({ valid: t, storms }));
        })
        .catch((err) => {
          spanCache.delete(id);
          throw err;
        })
    );
  }
  return spanCache.get(id);
}
// The radar's detections in effect at time t: its newest volume at or
// before t (within 12 minutes).
export function stormsFromHistory(history, t) {
  const ms = t.getTime() + 60e3;
  let pick = null;
  for (const h of history) if (h.valid <= ms) pick = h;
  return pick && ms - pick.valid <= 12 * 60e3 ? pick.storms : [];
}

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export const compassOf = (deg) => COMPASS[Math.round(deg / 22.5) % 16];

// Point `minutes` ahead along the storm's motion (flat-earth is fine at this scale).
export function aheadOf(s, minutes) {
  const km = (s.mph * 1.609344 * minutes) / 60;
  const rad = (s.toward * Math.PI) / 180;
  return [s.lat + (km * Math.cos(rad)) / 111.32, s.lon + (km * Math.sin(rad)) / (111.32 * Math.cos((s.lat * Math.PI) / 180))];
}
