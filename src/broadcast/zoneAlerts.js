// Wind and winter alerts for the broadcast (High Wind, Winter Storm, Blizzard,
// Ice Storm and Lake Effect Snow warnings, their watches and advisories),
// exactly as issued. These cover whole forecast zones (no polygon), so the zone
// outlines come from the Iowa Environmental Mesonet's copy of the same alerts.
// Text on screen is quoted from the NWS alert.

import L from 'leaflet';
import { warningsAt } from '../radar/providers/warnings';

const NWS = 'https://api.weather.gov/alerts/active';
const IEM_ZONES = 'https://mesonet.agron.iastate.edu/api/1/vtec/county_zone.geojson';
const POLL_MS = 2 * 60e3;
const SHAPES_MIN_MS = 15 * 60e3; // re-download outlines at most this often

// NWS hazard map colors, most serious first. tier: 0 warning, 1 watch, 2 advisory.
export const ZONE_TYPES = [
  { event: 'Blizzard Warning', phen: 'BZ', kind: 'winter', tier: 0, color: '#FF4500' },
  { event: 'Ice Storm Warning', phen: 'IS', kind: 'winter', tier: 0, color: '#8B008B' },
  { event: 'Winter Storm Warning', phen: 'WS', kind: 'winter', tier: 0, color: '#FF69B4' },
  { event: 'Lake Effect Snow Warning', phen: 'LE', kind: 'winter', tier: 0, color: '#008B8B' },
  { event: 'High Wind Warning', phen: 'HW', kind: 'wind', tier: 0, color: '#DAA520' },
  { event: 'Winter Storm Watch', phen: 'WS', kind: 'winter', tier: 1, color: '#4682B4' },
  { event: 'High Wind Watch', phen: 'HW', kind: 'wind', tier: 1, color: '#B8860B' },
  { event: 'Winter Weather Advisory', phen: 'WW', kind: 'winter', tier: 2, color: '#7B68EE' },
  { event: 'Wind Advisory', phen: 'WI', kind: 'wind', tier: 2, color: '#D2B48C' },
].map((t, rank) => ({ ...t, rank }));
const BY_EVENT = new Map(ZONE_TYPES.map((t) => [t.event, t]));
const PHENS = new Set(ZONE_TYPES.map((t) => t.phen));
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
  const type = BY_EVENT.get(p.event);
  // Biggest number in the alert's own WHAT line, to pick which alert a screen
  // quotes: the gust (mph) for wind, the snow total (inches) for winter.
  const re = type.kind === 'wind' ? /gusts? (?:as high as |up )?to (\d+) mph|gusting as high as (\d+) mph/gi : /(\d+)(?: (?:to|and) (\d+))? inch/gi;
  const amount = Math.max(0, ...[...(s.WHAT || '').matchAll(re)].map((m) => Math.max(...m.slice(1).filter(Boolean).map(Number))));
  return {
    id: p.id,
    type,
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
    amount,
    states: [...new Set((p.geocode?.UGC || []).map((u) => u.slice(0, 2)))].filter((st) => !OUTSIDE.test(st)),
  };
}

async function fetchAlerts(signal) {
  const events = encodeURIComponent(ZONE_TYPES.map((t) => t.event).join(','));
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
    if (PHENS.has(ph) && f.geometry) shapes.set(f.properties.ugc, f.geometry);
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
export function subscribeZoneAlerts(fn) {
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

// Alerts of one kind (wind or winter) that touch or sit next to each other, as
// one screen each: warnings first, then watches, then advisories, then the
// biggest area (most zones). Each group quotes its most serious alert with the
// strongest gusts or the most snow.
const zones = (g) => new Set(g.alerts.flatMap((a) => a.ugcs)).size;
export function alertGroups(alerts) {
  return ['wind', 'winter'].flatMap((kind) => groupsOf(alerts.filter((a) => a.type.kind === kind)))
    .sort((a, b) => a.top.type.tier - b.top.type.tier || zones(b) - zones(a));
}
function groupsOf(alerts) {
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
      const top = [...list].sort((a, b) => a.type.rank - b.type.rank || b.amount - a.amount)[0];
      const main = list.filter((a) => a.type === top.type);
      return {
        id: list.map((a) => a.id).sort().join('|'),
        top,
        alerts: list,
        box: boxOf(list.flatMap((a) => a.shapes)),
        // What the screen frames: the alerts of the group's most serious type.
        focus: boxOf(main.flatMap((a) => a.shapes)),
        // States under the alert type the screen is named after; the other
        // alerts in the area are listed separately by type.
        states: [...new Set(main.flatMap((a) => a.states))],
        also: [...new Set(list.filter((a) => a.type !== top.type).map((a) => a.type))]
          .sort((x, y) => x.rank - y.rank)
          .map((t) => ({ type: t, states: [...new Set(list.filter((a) => a.type === t).flatMap((a) => a.states))] })),
        offices: [...new Set(main.map((a) => a.office))],
        // Times of the alerts the screen is named after.
        onset: main.map((a) => a.onset).sort()[0],
        ends: main.map((a) => a.ends).sort().at(-1),
      };
    });
}

// Is any part of [[s,w],[n,e]] under a wind alert zone's outline box?
export function windInView(alerts, view) {
  return alerts.some((a) => {
    if (a.type.kind !== 'wind') return false;
    const b = boxOf(a.shapes);
    return b && b[0][0] < view[1][0] && view[0][0] < b[1][0] && b[0][1] < view[1][1] && view[0][1] < b[1][1];
  });
}

// Shaded zones, least serious drawn first, in the given map pane.
export function zoneLayer(alerts, pane = 'windzones') {
  const group = L.layerGroup();
  const renderer = L.svg({ pane });
  for (const a of [...alerts].sort((x, y) => y.type.rank - x.type.rank)) {
    for (const g of a.shapes) {
      L.geoJSON(g, {
        pane,
        renderer,
        interactive: false,
        // Warnings strongest, watches lighter, advisories lightest.
        style: { color: a.type.color, weight: [2.5, 1.5, 1][a.type.tier], opacity: 0.9, fillColor: a.type.color, fillOpacity: [0.4, 0.2, 0.14][a.type.tier] },
      }).addTo(group);
    }
  }
  return group;
}

// Alerts whose zones contain a point, most serious first.
export function zoneAlertsAt(alerts, lat, lon) {
  return alerts
    .filter((a) => warningsAt(a.shapes.map((geometry) => ({ geometry })), lat, lon).length)
    .sort((x, y) => x.type.rank - y.type.rank);
}

// "Wed 10 PM to Thu 10 PM EST" in the given time zone.
export function alertTime(onset, ends, tz) {
  const f = (d, o) => new Date(d).toLocaleString('en-US', { timeZone: tz || undefined, ...o });
  const day = { weekday: 'short', hour: 'numeric', minute: '2-digit' };
  const tzName = f(ends, { timeZoneName: 'short' }).split(' ').pop();
  const started = Date.parse(onset) <= Date.now();
  const end = `${f(ends, day).replace(':00', '')} ${tzName}`;
  return started ? `Until ${end}` : `${f(onset, day).replace(':00', '')} to ${end}`;
}
