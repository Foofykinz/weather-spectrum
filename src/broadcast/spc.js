// Storm Prediction Center convective outlooks (Days 1-3), straight from
// SPC's GeoJSON. Current: /products/outlook/dayNotlk_cat.lyr.geojson.
// Replay: the archived issuance in effect at that time.
// Categories, colors and probabilities are SPC's own; nothing is derived
// except which tour cities fall inside an area (a point-in-polygon test).

const BASE = 'https://www.spc.noaa.gov/products/outlook';

export const CATEGORIES = [
  { id: 'TSTM', level: 0, name: 'General thunderstorms', short: 'Thunder' },
  { id: 'MRGL', level: 1, name: 'Marginal Risk', short: 'Marginal' },
  { id: 'SLGT', level: 2, name: 'Slight Risk', short: 'Slight' },
  { id: 'ENH', level: 3, name: 'Enhanced Risk', short: 'Enhanced' },
  { id: 'MDT', level: 4, name: 'Moderate Risk', short: 'Moderate' },
  { id: 'HIGH', level: 5, name: 'High Risk', short: 'High' },
];
const CAT = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
// SPC's standard colors, used for the key when a category isn't on today's map.
export const DEFAULT_FILL = { TSTM: '#C1E9C1', MRGL: '#66A366', SLGT: '#FFE066', ENH: '#FFA366', MDT: '#E06666', HIGH: '#EE99EE' };

// Issuance times (UTC, HHMM) for archived outlooks, newest first.
const ISSUES = { 1: ['2000', '1630', '1300', '1200', '0600', '0100'], 2: ['1730', '0600'], 3: ['1930', '0730'] };

const cache = new Map(); // url -> { at, promise }
function getJson(url) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < 10 * 60e3) return hit.promise;
  const promise = fetch(url)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  cache.set(url, { at: Date.now(), promise });
  return promise;
}

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;

// Archived file names for the issuances before `at`, newest first.
function archiveNames(day, at) {
  const out = [];
  for (let back = 0; back < 2; back++) {
    const d = new Date(at.getTime() - back * 86400e3);
    for (const hhmm of ISSUES[day]) {
      const issued = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), +hhmm.slice(0, 2), +hhmm.slice(2));
      if (issued <= at.getTime()) out.push(`archive/${d.getUTCFullYear()}/day${day}otlk_${ymd(d)}_${hhmm}`);
    }
  }
  return out;
}

async function layer(day, kind, at) {
  if (!at) return getJson(`${BASE}/day${day}otlk_${kind}.lyr.geojson`);
  for (const name of archiveNames(day, at)) {
    const j = await getJson(`${BASE}/${name}_${kind}.lyr.geojson`);
    if (j?.features) return j;
  }
  return null;
}

// Highest probability in a Day 1 probability layer: { pct, significant }
function maxProb(j) {
  let pct = 0;
  let significant = false;
  for (const f of j?.features || []) {
    const l = String(f.properties.LABEL || '');
    if (l === 'SIGN') significant = true;
    else if (/^0?\.\d+$/.test(l)) pct = Math.max(pct, Math.round(parseFloat(l) * 100));
  }
  return { pct, significant };
}

// Even-odd point-in-polygon for GeoJSON Polygon / MultiPolygon.
function inside(geom, lon, lat) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  let hit = false;
  for (const rings of polys) {
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
      }
    }
  }
  return hit;
}

// Times: ISO fields in current files; older archived files only have
// YYYYMMDDHHMM (UTC).
function when(iso, compact) {
  if (iso) return new Date(iso);
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(String(compact || ''));
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])) : null;
}

// -> { day, features, top, issued, valid, expire, probs, cities } or null
export async function fetchOutlook(day, at, cities = []) {
  const cat = await layer(day, 'cat', at);
  if (!cat) return null;
  const features = (cat.features || []).filter((f) => f.geometry && CAT[f.properties.LABEL]);
  const p = cat.features?.[0]?.properties || {};
  const top = features.reduce((best, f) => (!best || CAT[f.properties.LABEL].level > CAT[best.properties.LABEL].level ? f : best), null);
  const topCat = top ? CAT[top.properties.LABEL] : null;
  let probs = null;
  if (day === 1) {
    const [torn, wind, hail] = await Promise.all(['torn', 'wind', 'hail'].map((k) => layer(1, k, at)));
    probs = { tornado: maxProb(torn), wind: maxProb(wind), hail: maxProb(hail) };
  }
  // Tour cities inside the highest-risk area (only when it's an actual severe risk).
  const inTop = topCat && topCat.level >= 1 ? cities.filter((c) => features.some((f) => f.properties.LABEL === topCat.id && inside(f.geometry, c.lon, c.lat))) : [];
  return {
    day,
    features,
    top: topCat,
    issued: when(p.ISSUE_ISO, p.ISSUE),
    valid: when(p.VALID_ISO, p.VALID),
    expire: when(p.EXPIRE_ISO, p.EXPIRE),
    probs,
    cities: inTop.map((c) => `${c.name}, ${c.state}`),
  };
}
