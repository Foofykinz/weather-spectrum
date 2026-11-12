// NWS warnings and watches, exactly as issued. Nothing is drawn or estimated
// by us: warning shapes are the polygons the issuing NWS office put in each
// warning, and watches are the counties/marine zones listed in the watch.
//
// Live view: the National Weather Service API (api.weather.gov), refreshed
// every minute by one shared fetcher for every map on the page.
// Loop frames: what was in effect at each frame's time. Warning polygons come
// from the Iowa Environmental Mesonet archive of the same NWS products (it
// keeps every polygon update with the minutes it was valid); watch areas are
// rebuilt from the NWS API's message history.

const NWS = 'https://api.weather.gov/alerts';
const IEM_SBW = 'https://mesonet.agron.iastate.edu/geojson/sbw.py';
const POLL_MS = 60000;

// Polygon warnings, with the NWS's own map colors (weather.gov hazard map),
// most urgent first. Drawing order is the reverse, so tornado warnings sit on top.
export const WARNING_TYPES = [
  { event: 'Tornado Warning', phen: 'TO', short: 'Tornado', color: '#FF0000' },
  { event: 'Extreme Wind Warning', phen: 'EW', short: 'Extreme wind', color: '#FF8C00' },
  { event: 'Severe Thunderstorm Warning', phen: 'SV', short: 'Severe t-storm', color: '#FFA500' },
  { event: 'Flash Flood Warning', phen: 'FF', short: 'Flash flood', color: '#8B0000' },
  { event: 'Snow Squall Warning', phen: 'SQ', short: 'Snow squall', color: '#C71585' },
  { event: 'Special Marine Warning', phen: 'MA', short: 'Special marine', color: '#FFA500' },
  { event: 'Dust Storm Warning', phen: 'DS', short: 'Dust storm', color: '#FFE4C4' },
  { event: 'Flood Warning', phen: 'FA', short: 'Flood', color: '#00FF00' },
];
// Watches (county / marine zone based), NWS colors.
export const WATCH_TYPES = [
  { event: 'Tornado Watch', phen: 'TO', short: 'Tornado watch', color: '#FFFF00' },
  { event: 'Severe Thunderstorm Watch', phen: 'SV', short: 'Severe t-storm watch', color: '#DB7093' },
];
const rankOf = (list) => new Map(list.map((t, i) => [t.event, { ...t, rank: i }]));
const WARN_BY_EVENT = rankOf(WARNING_TYPES);
const WATCH_BY_EVENT = rankOf(WATCH_TYPES);
const WARN_BY_PHEN = new Map([...WARN_BY_EVENT.values()].map((t) => [t.phen, t]));
WARN_BY_PHEN.set('FL', WARN_BY_EVENT.get('Flood Warning')); // river flood warnings are also "Flood Warning"

export const WARNINGS_ATTRIBUTION =
  'Warnings: <a href="https://www.weather.gov/" target="_blank" rel="noopener">NOAA/NWS</a>; past polygons via <a href="https://mesonet.agron.iastate.edu/" target="_blank" rel="noopener">IEM</a>';

const first = (p, k) => (Array.isArray(p.parameters?.[k]) ? p.parameters[k][0] : null);
const upper = (v) => (v ? String(v).toUpperCase() : null);

// "/O.CON.KOKX.TO.W.0006.000000T0000Z-261112T1900Z/" -> parts
function parseVtec(v) {
  const m = /^\/[OTEX]\.([A-Z]{3})\.([A-Z]{4})\.([A-Z]{2})\.([A-Z])\.(\d{4})\.(\d{6}T\d{4}Z)-(\d{6}T\d{4}Z)\//.exec(v || '');
  if (!m) return null;
  const t = (s) => (s === '000000T0000Z' ? null : Date.UTC(2000 + +s.slice(0, 2), +s.slice(2, 4) - 1, +s.slice(4, 6), +s.slice(7, 9), +s.slice(9, 11)));
  return { action: m[1], office: m[2], phen: m[3], sig: m[4], etn: m[5], begin: t(m[6]), end: t(m[7]), key: `${m[2]}.${m[3]}.${m[4]}.${m[5]}` };
}
const ENDED = new Set(['CAN', 'EXP', 'UPG']);

// Danger level from the warning's own tags: 'emergency' (tornado / flash
// flood emergency), 'high' (PDS / considerable / destructive), or null.
function dangerOf({ tornadoThreat, stormThreat, floodThreat }) {
  if (tornadoThreat === 'CATASTROPHIC' || floodThreat === 'CATASTROPHIC') return 'emergency';
  if (tornadoThreat === 'CONSIDERABLE' || stormThreat === 'DESTRUCTIVE' || floodThreat === 'CONSIDERABLE') return 'high';
  return null;
}

// ---------- live warnings (NWS API)

function liveWarning(f) {
  const p = f.properties;
  const w = {
    id: p.id,
    type: WARN_BY_EVENT.get(p.event),
    geometry: f.geometry,
    office: p.senderName,
    sent: p.sent,
    ends: p.ends || first(p, 'eventEndingTime') || p.expires,
    tornado: upper(first(p, 'tornadoDetection')),
    tornadoThreat: upper(first(p, 'tornadoDamageThreat')),
    stormThreat: upper(first(p, 'thunderstormDamageThreat')),
    floodThreat: upper(first(p, 'flashFloodDamageThreat')),
    hail: first(p, 'maxHailSize') ? `${first(p, 'maxHailSize')} in` : null,
    wind: first(p, 'maxWindGust'),
    text: [p.description, p.instruction].filter(Boolean).join('\n\n'),
  };
  w.danger = dangerOf(w);
  return w;
}

// Of all messages about one warning, keep the newest one (a cancellation or
// expiry removes it; a partial cancellation keeps the continuing polygon).
function newestPerEvent(features, now) {
  const groups = new Map();
  for (const f of features) {
    const p = f.properties;
    const v = (p.parameters?.VTEC || []).map(parseVtec).find(Boolean);
    const key = v ? v.key : p.id;
    const sent = Date.parse(p.sent);
    const g = groups.get(key);
    if (!g || sent > g.sent) groups.set(key, { sent, items: [{ f, v }] });
    else if (sent === g.sent) g.items.push({ f, v });
  }
  const out = [];
  for (const { items } of groups.values()) {
    const keep = items.find(({ f, v }) => f.geometry && f.properties.messageType !== 'Cancel' && !(v && ENDED.has(v.action)));
    if (!keep) continue;
    const p = keep.f.properties;
    const end = Date.parse(p.ends || first(p, 'eventEndingTime') || p.expires);
    if (Number.isFinite(end) && end <= now) continue;
    out.push(keep.f);
  }
  return out;
}

async function getJson(url, signal) {
  const res = await fetch(url, { signal, headers: { Accept: 'application/geo+json' } });
  if (!res.ok) throw new Error(`${new URL(url).hostname} request failed (${res.status})`);
  return res.json();
}

const sortWarnings = (list) => list.sort((a, b) => b.type.rank - a.type.rank); // least urgent first = drawn under

async function fetchLiveWarnings(signal) {
  const events = WARNING_TYPES.map((t) => t.event).join(',');
  const json = await getJson(`${NWS}/active?status=actual&event=${encodeURIComponent(events)}`, signal);
  const now = Date.now();
  const feats = (json.features || []).filter((f) => f.properties?.status === 'Actual' && WARN_BY_EVENT.has(f.properties.event));
  return sortWarnings(newestPerEvent(feats, now).map(liveWarning));
}

// ---------- watches (NWS API; areas are county / marine zone codes)

// Per watch and per county: the newest message decides whether that county is
// in the watch at time t (NEW/CON/EXA/EXB/EXT keep it, CAN/EXP remove it).
function watchesAt(messages, t) {
  const latest = new Map(); // `${key}|${ugc}` -> message
  for (const m of messages) {
    if (m.sent > t) continue;
    for (const ugc of m.ugcs) {
      const k = `${m.vtec.key}|${ugc}`;
      const prev = latest.get(k);
      if (!prev || m.sent >= prev.sent) latest.set(k, m);
    }
  }
  const byWatch = new Map();
  for (const [k, m] of latest) {
    const { vtec } = m;
    if (ENDED.has(vtec.action) || (vtec.begin && vtec.begin > t) || (vtec.end && vtec.end <= t)) continue;
    const ugc = k.split('|')[1];
    const w = byWatch.get(vtec.key) || { ...m, ugcs: [] };
    if (m.sent >= w.sent) Object.assign(w, { ...m, ugcs: w.ugcs });
    w.ugcs.push(ugc);
    byWatch.set(vtec.key, w);
  }
  return [...byWatch.values()].map(({ vtec, ...w }) => ({ ...w, ends: vtec.end ? new Date(vtec.end).toISOString() : w.ends, number: +vtec.etn }));
}

function watchMessages(features) {
  const out = [];
  for (const f of features) {
    const p = f.properties;
    const type = WATCH_BY_EVENT.get(p.event);
    if (!type || p.status !== 'Actual') continue;
    const vtec = (p.parameters?.VTEC || []).map(parseVtec).find((v) => v && v.sig === 'A' && v.phen === type.phen);
    if (!vtec) continue;
    out.push({
      id: p.id, type, vtec, sent: Date.parse(p.sent), ugcs: p.geocode?.UGC || [],
      office: p.senderName, ends: p.ends || p.expires, text: [p.description, p.instruction].filter(Boolean).join('\n\n'),
    });
  }
  return out;
}

const WATCH_EVENTS = encodeURIComponent(WATCH_TYPES.map((t) => t.event).join(','));

async function fetchLiveWatches(signal) {
  const json = await getJson(`${NWS}/active?status=actual&event=${WATCH_EVENTS}`, signal);
  return watchesAt(watchMessages(json.features || []), Date.now());
}

// Watch message history since `start` (follows the API's pages).
async function fetchWatchHistory(start, signal) {
  let url = `${NWS}?status=actual&event=${WATCH_EVENTS}&start=${new Date(start).toISOString().slice(0, 19)}Z&limit=500`;
  const feats = [];
  for (let page = 0; url && page < 10; page++) {
    const json = await getJson(url, signal);
    feats.push(...(json.features || []));
    url = json.features?.length ? json.pagination?.next : null;
  }
  return watchMessages(feats);
}

// ---------- county / marine zone outlines (static file, loaded on first need)

let shapesPromise = null;
export function loadShapes() {
  shapesPromise ||= fetch('/data/ugc-shapes.json')
    .then((r) => {
      if (!r.ok) throw new Error(`County outlines failed to load (${r.status})`);
      return r.json();
    })
    .then((raw) => {
      const shapes = new Map();
      for (const [ugc, rings] of Object.entries(raw)) {
        shapes.set(ugc, rings.map((enc) => {
          const pts = [];
          let x = 0;
          let y = 0;
          for (let i = 0; i < enc.length; i += 2) {
            x += enc[i];
            y += enc[i + 1];
            pts.push([y / 100, x / 100]); // [lat, lon]
          }
          return pts;
        }));
      }
      return shapes;
    })
    .catch((err) => {
      shapesPromise = null; // allow a retry later
      throw err;
    });
  return shapesPromise;
}

// ---------- past warnings (IEM archive of NWS polygons)

function pastWarning(f) {
  const p = f.properties;
  const type = WARN_BY_PHEN.get(p.phenomena);
  const isTor = p.phenomena === 'TO';
  const w = {
    id: f.id,
    type,
    geometry: f.geometry,
    office: `NWS ${p.wfo}`,
    sent: p.polygon_begin,
    ends: p.expire_utc || p.expire,
    tornado: upper(p.tornadotag),
    tornadoThreat: isTor ? upper(p.damagetag) : null,
    stormThreat: p.phenomena === 'SV' ? upper(p.damagetag) : null,
    floodThreat: upper(p.floodtag_damage),
    hail: p.hailtag != null ? `${p.hailtag} in` : null,
    wind: p.windtag != null ? `${p.windtag} mph` : null,
    link: p.product_id ? `https://mesonet.agron.iastate.edu/p.php?pid=${encodeURIComponent(p.product_id)}` : null,
  };
  w.danger = p.is_emergency ? 'emergency' : p.is_pds ? 'high' : dangerOf(w);
  return w;
}

const pastCache = new Map(); // minute -> Promise<warnings>
function pastWarnings(t, signal) {
  const minute = new Date(Math.floor(t / 60000) * 60000).toISOString().slice(0, 16) + 'Z';
  if (!pastCache.has(minute)) {
    const p = getJson(`${IEM_SBW}?ts=${minute}`, signal).then((json) =>
      sortWarnings((json.features || []).filter((f) => f.properties.significance === 'W' && WARN_BY_PHEN.has(f.properties.phenomena)).map(pastWarning))
    );
    p.catch(() => pastCache.delete(minute));
    pastCache.set(minute, p);
    if (pastCache.size > 60) pastCache.delete(pastCache.keys().next().value);
  }
  return pastCache.get(minute);
}

// Everything in effect at each of `times` (Dates), for a loop.
// Returns Map(time ms -> { warnings, watches, shapes, error }).
export async function loadHistory(times, signal) {
  const ms = times.map((d) => d.getTime());
  const earliest = Math.min(...ms);
  const [watchMsgs, ...perFrame] = await Promise.all([
    fetchWatchHistory(earliest - 24 * 3600 * 1000, signal).catch((e) => (e.name === 'AbortError' ? Promise.reject(e) : e)),
    ...ms.map((t) => pastWarnings(t, signal).catch((e) => (e.name === 'AbortError' ? Promise.reject(e) : e))),
  ]);
  const watchErr = watchMsgs instanceof Error ? watchMsgs : null;
  const watchList = ms.map((t) => (watchErr ? [] : watchesAt(watchMsgs, t)));
  let shapes = null;
  let shapeErr = null;
  if (watchList.some((l) => l.length)) shapes = await loadShapes().catch((e) => ((shapeErr = e), null));
  const out = new Map();
  ms.forEach((t, i) => {
    const w = perFrame[i];
    out.set(t, {
      warnings: w instanceof Error ? [] : w,
      watches: watchList[i],
      shapes,
      error: w instanceof Error ? w : watchErr || shapeErr,
      at: new Date(t),
    });
  });
  return out;
}

// ---------- live store

let state = { warnings: [], watches: [], shapes: null, updated: null, error: null };
const listeners = new Set();
let timer = null;
let controller = null;

async function poll() {
  clearTimeout(timer);
  controller?.abort();
  controller = new AbortController();
  const { signal } = controller;
  try {
    const [warnings, watches] = await Promise.all([fetchLiveWarnings(signal), fetchLiveWatches(signal)]);
    let { shapes } = state;
    let error = null;
    if (watches.length && !shapes) shapes = await loadShapes().catch((e) => ((error = e), null));
    state = { warnings, watches, shapes, updated: new Date(), error };
  } catch (err) {
    if (err.name === 'AbortError') return;
    state = { ...state, error: err };
  }
  listeners.forEach((fn) => fn(state));
  if (listeners.size && !document.hidden) timer = setTimeout(poll, POLL_MS);
}

function onVisibility() {
  if (document.hidden) clearTimeout(timer);
  else if (listeners.size) poll();
}

export function subscribeWarnings(fn) {
  listeners.add(fn);
  if (listeners.size === 1) {
    document.addEventListener('visibilitychange', onVisibility);
    poll();
  } else if (state.updated || state.error) fn(state);
  return () => {
    listeners.delete(fn);
    if (!listeners.size) {
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener('visibilitychange', onVisibility);
    }
  };
}

// ---------- what's at a clicked point

// Even-odd ray casting over rings of [x, y] pairs.
function inRings(rings, x, y, getX, getY) {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = getX(ring[i]);
      const yi = getY(ring[i]);
      const xj = getX(ring[j]);
      const yj = getY(ring[j]);
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}
const gx = (c) => c[0];
const gy = (c) => c[1];
const lx = (c) => c[1];
const ly = (c) => c[0];

export function warningsAt(warnings, lat, lon) {
  return warnings
    .filter(({ geometry: g }) =>
      g.type === 'Polygon' ? inRings(g.coordinates, lon, lat, gx, gy)
        : g.type === 'MultiPolygon' ? g.coordinates.some((p) => inRings(p, lon, lat, gx, gy))
          : false
    )
    .reverse(); // most urgent first
}

export function watchesAtPoint(watches, shapes, lat, lon) {
  if (!shapes) return [];
  return watches.filter((w) => w.ugcs.some((u) => shapes.has(u) && inRings(shapes.get(u), lon, lat, lx, ly)));
}
