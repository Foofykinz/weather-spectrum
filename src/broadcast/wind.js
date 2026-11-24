// Wind alerts for the broadcast: NWS High Wind Warnings, High Wind Watches and
// Wind Advisories, exactly as issued. These cover whole forecast zones (no
// polygon), so the zone outlines come from the Iowa Environmental Mesonet's
// copy of the same alerts. Text on screen is quoted from the NWS alert.

import L from 'leaflet';

const NWS = 'https://api.weather.gov/alerts/active';
const IEM_ZONES = 'https://mesonet.agron.iastate.edu/api/1/vtec/county_zone.geojson';
const POLL_MS = 2 * 60e3;
const SHAPES_MIN_MS = 15 * 60e3; // re-download outlines at most this often

// NWS hazard map colors, most serious first.
export const WIND_TYPES = [
  { event: 'High Wind Warning', code: 'HW.W', short: 'High wind warning', color: '#DAA520', rank: 0 },
  { event: 'High Wind Watch', code: 'HW.A', short: 'High wind watch', color: '#B8860B', rank: 1 },
  { event: 'Wind Advisory', code: 'WI.Y', short: 'Wind advisory', color: '#D2B48C', rank: 2 },
];
const BY_EVENT = new Map(WIND_TYPES.map((t) => [t.event, t]));
// The broadcast radar covers the lower 48 only.
const OUTSIDE = /^(AK|HI|PR|VI|GU|AS|MP)/;

const squash = (s) => s.replace(/\s+/g, ' ').trim();
// "* WHAT...East winds 25 to 35 mph..." -> { WHAT: '...' }
function sections(text) {
  const out = {};
  const re = /\*\s*([A-Z ]+)\.\.\.([\s\S]*?)(?=\n\s*\n|\n\s*\*\s*[A-Z ]+\.\.\.|$)/g;
  let m;
  while ((m = re.exec(text || ''))) out[m[1].trim()] = squash(m[2]);
  return out;
}

function toAlert(f) {
  const p = f.properties;
  const s = sections(p.description);
  const gust = Math.max(0, ...[...(s.WHAT || '').matchAll(/gusts? (?:up )?to (\d+) mph/gi)].map((m) => +m[1]));
  return {
    id: p.id,
    type: BY_EVENT.get(p.event),
    office: p.senderName,
    ugcs: (p.geocode?.UGC || []).filter((u) => !OUTSIDE.test(u)),
    area: p.areaDesc,
    sent: p.sent,
    onset: p.onset || p.effective,
    ends: p.ends || p.expires,
    what: s.WHAT || null,
    where: s.WHERE || null,
    when: s.WHEN || null,
    impacts: s.IMPACTS || null,
    gust,
    states: [...new Set((p.geocode?.UGC || []).map((u) => u.slice(0, 2)))].filter((st) => !OUTSIDE.test(st)),
  };
}

async function fetchAlerts(signal) {
  const events = encodeURIComponent(WIND_TYPES.map((t) => t.event).join(','));
  const r = await fetch(`${NWS}?status=actual&event=${events}`, { signal, headers: { Accept: 'application/geo+json' } });
  if (!r.ok) throw new Error(`NWS alerts failed (${r.status})`);
  const feats = ((await r.json()).features || []).filter((f) => f.properties.status === 'Actual' && BY_EVENT.has(f.properties.event));
  // An update replaces the message it references.
  const replaced = new Set(feats.flatMap((f) => (f.properties.references || []).map((x) => x.identifier)));
  const now = Date.now();
  return feats
    .filter((f) => !replaced.has(f.properties.id) && f.properties.messageType !== 'Cancel')
    .map(toAlert)
    .filter((a) => a.ugcs.length && !(Date.parse(a.ends) <= now));
}

// ---- zone outlines (cached for good: zones don't move)
const shapes = new Map(); // ugc -> GeoJSON geometry
let shapesAt = 0;
async function loadShapes(ugcs, signal) {
  if (ugcs.every((u) => shapes.has(u)) || Date.now() - shapesAt < SHAPES_MIN_MS) return;
  shapesAt = Date.now();
  const r = await fetch(IEM_ZONES, { signal });
  if (!r.ok) throw new Error(`Zone outlines failed (${r.status})`);
  for (const f of (await r.json()).features || []) {
    const ph = f.properties?.phenomena;
    if ((ph === 'HW' || ph === 'WI') && f.geometry) shapes.set(f.properties.ugc, f.geometry);
  }
}

// ---- live store
let state = null; // { alerts, error }
const listeners = new Set();
let timer = 0;
let ctl = null;
async function poll() {
  clearTimeout(timer);
  ctl?.abort();
  ctl = new AbortController();
  try {
    const alerts = await fetchAlerts(ctl.signal);
    await loadShapes(alerts.flatMap((a) => a.ugcs), ctl.signal).catch(() => {});
    state = { alerts: alerts.map((a) => ({ ...a, shapes: a.ugcs.map((u) => shapes.get(u)).filter(Boolean) })), error: null };
  } catch (e) {
    if (e.name === 'AbortError') return;
    state = { alerts: state?.alerts || [], error: e };
  }
  listeners.forEach((fn) => fn(state));
  if (listeners.size) timer = setTimeout(poll, POLL_MS);
}
export function subscribeWind(fn) {
  listeners.add(fn);
  if (state) fn(state);
  if (listeners.size === 1) poll();
  return () => {
    listeners.delete(fn);
    if (!listeners.size) {
      clearTimeout(timer);
      ctl?.abort();
    }
  };
}

// ---- helpers
function boxOf(geoms) {
  let s = 90, w = 180, n = -90, e = -180;
  const walk = (c) => {
    if (typeof c[0] === 'number') {
      s = Math.min(s, c[1]); n = Math.max(n, c[1]); w = Math.min(w, c[0]); e = Math.max(e, c[0]);
    } else c.forEach(walk);
  };
  geoms.forEach((g) => walk(g.coordinates));
  return n >= s ? [[s, w], [n, e]] : null;
}

// Alerts that touch or sit next to each other, as one screen each: the most
// serious type first, then the biggest area (most zones). Each group quotes
// its most serious alert with the strongest gusts.
const zones = (g) => new Set(g.alerts.flatMap((a) => a.ugcs)).size;
export function windGroups(alerts) {
  const items = alerts.map((a) => ({ a, box: boxOf(a.shapes) })).filter((x) => x.box);
  const near = (p, q) => p.box[0][0] - 0.3 < q.box[1][0] && q.box[0][0] - 0.3 < p.box[1][0] && p.box[0][1] - 0.3 < q.box[1][1] && q.box[0][1] - 0.3 < p.box[1][1];
  const groups = [];
  for (const it of items) {
    const hits = groups.filter((g) => g.some((x) => near(x, it)));
    const merged = [it, ...hits.flat()];
    for (const h of hits) groups.splice(groups.indexOf(h), 1);
    groups.push(merged);
  }
  return groups
    .map((g) => {
      const list = g.map((x) => x.a);
      const top = [...list].sort((a, b) => a.type.rank - b.type.rank || b.gust - a.gust)[0];
      const main = list.filter((a) => a.type === top.type);
      return {
        id: list.map((a) => a.id).sort().join('|'),
        top,
        alerts: list,
        box: boxOf(list.flatMap((a) => a.shapes)),
        // What the screen frames: the alerts of the group's most serious type.
        focus: boxOf(main.flatMap((a) => a.shapes)),
        states: [...new Set(list.flatMap((a) => a.states))],
        offices: [...new Set(list.map((a) => a.office))],
        // Times of the alerts the screen is named after.
        onset: main.map((a) => a.onset).sort()[0],
        ends: main.map((a) => a.ends).sort().at(-1),
      };
    })
    .sort((a, b) => a.top.type.rank - b.top.type.rank || zones(b) - zones(a) || b.top.gust - a.top.gust);
}

// Is any part of [[s,w],[n,e]] under a wind alert zone's outline box?
export function windInView(alerts, view) {
  return alerts.some((a) => {
    const b = boxOf(a.shapes);
    return b && b[0][0] < view[1][0] && view[0][0] < b[1][0] && b[0][1] < view[1][1] && view[0][1] < b[1][1];
  });
}

// Shaded zones, least serious drawn first.
export function windZoneLayer(alerts) {
  const group = L.layerGroup();
  const renderer = L.svg({ pane: 'windzones' });
  for (const a of [...alerts].sort((x, y) => y.type.rank - x.type.rank)) {
    for (const g of a.shapes) {
      L.geoJSON(g, {
        pane: 'windzones',
        renderer,
        interactive: false,
        style: { color: a.type.color, weight: 2, opacity: 0.9, fillColor: a.type.color, fillOpacity: 0.28 },
      }).addTo(group);
    }
  }
  return group;
}

// "Wed 10 PM to Thu 10 PM EST" in the given time zone.
export function windTime(onset, ends, tz) {
  const f = (d, o) => new Date(d).toLocaleString('en-US', { timeZone: tz || undefined, ...o });
  const day = { weekday: 'short', hour: 'numeric', minute: '2-digit' };
  const tzName = f(ends, { timeZoneName: 'short' }).split(' ').pop();
  const started = Date.parse(onset) <= Date.now();
  const end = `${f(ends, day).replace(':00', '')} ${tzName}`;
  return started ? `Until ${end}` : `${f(onset, day).replace(':00', '')} to ${end}`;
}
