// Collect the official warning timeline for each event page, from the IEM
// archive of NWS warnings, and save it with the site (src/seo/event-data.json).
// Run by hand when adding an event:  node scripts/build-events.mjs [slug ...]
// (with slugs, only those events are fetched; the others are kept as saved).
//
// For each event: every tornado warning (and severe thunderstorm warning) in
// effect over the tornado's path while it was on the ground, with its issue
// and end times and each follow-up statement (time, first headline line).
// Nothing is summarized: lines are taken from the products themselves.
import { readFileSync, writeFileSync } from 'node:fs';

const IEM = 'https://mesonet.agron.iastate.edu';
// Points along each tornado's path (from the NWS event summaries), and the
// time window the tornado was on the ground (UTC).
const EVENTS = {
  'moore-tornado-2013': { wfo: 'OUN', start: '2013-05-20T19:40Z', end: '2013-05-20T20:40Z', points: [[35.26, -97.6], [35.33, -97.49], [35.33, -97.4]] },
  'joplin-tornado-2011': { wfo: 'SGF', start: '2011-05-22T22:15Z', end: '2011-05-22T23:15Z', points: [[37.07, -94.6], [37.07, -94.5], [37.04, -94.4]] },
  'el-reno-tornado-2013': { wfo: 'OUN', start: '2013-05-31T22:40Z', end: '2013-05-31T23:45Z', points: [[35.48, -98.12], [35.5, -98.03], [35.51, -97.93]] },
  'tuscaloosa-tornado-2011': { wfo: 'BMX', start: '2011-04-27T21:30Z', end: '2011-04-27T23:15Z', points: [[33.03, -87.94], [33.21, -87.55], [33.42, -87.18], [33.63, -86.74]] },
  'mayfield-tornado-2021': { wfo: 'PAH', start: '2021-12-11T02:40Z', end: '2021-12-11T03:50Z', points: [[36.5, -89.1], [36.62, -88.9], [36.74, -88.64], [36.88, -88.33]] },
  'greenfield-tornado-2024': { wfo: 'DMX', start: '2024-05-21T19:50Z', end: '2024-05-21T20:45Z', points: [[41.13, -94.65], [41.31, -94.46], [41.45, -94.3]] },
  'barnsdall-tornado-2024': { wfo: 'TSA', start: '2024-05-07T01:50Z', end: '2024-05-07T03:30Z', points: [[36.56, -96.16], [36.66, -96.05], [36.75, -95.98], [36.8, -95.93]] },
  'bridge-creek-moore-tornado-1999': { wfo: 'OUN', start: '1999-05-03T23:20Z', end: '1999-05-04T00:50Z', points: [[35.15, -97.88], [35.25, -97.73], [35.33, -97.5], [35.42, -97.4]] },
  'greensburg-tornado-2007': { wfo: 'DDC', start: '2007-05-05T01:55Z', end: '2007-05-05T03:05Z', points: [[37.25, -99.35], [37.45, -99.3], [37.6, -99.29]] },
  'rolling-fork-tornado-2023': { wfo: 'JAN', start: '2023-03-25T00:40Z', end: '2023-03-25T02:10Z', points: [[32.84, -91.0], [32.91, -90.88], [33.1, -90.5], [33.26, -90.11]] },
  'enderlin-tornado-2025': { wfo: 'FGF', start: '2025-06-21T03:45Z', end: '2025-06-21T04:21Z', points: [[46.57, -97.6], [46.63, -97.59], [46.69, -97.58]] },
};

const get = async (url) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
};

function inside(geom, lon, lat) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  let hit = false;
  for (const rings of polys) for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
    }
  }
  return hit;
}

// First line of the product's headline ("...A TORNADO WARNING REMAINS...") or
// its "* At ..." sentence, cleaned up.
function headline(text) {
  const t = text.replace(/\r/g, '');
  const h = /\.\.\.([^\n][\s\S]*?)\.\.\.(?:\n|$)/.exec(t.split(/\n\s*\n/).slice(2).join('\n\n'));
  if (h && h[1].length < 300) return h[1].replace(/\s+/g, ' ').trim();
  const at = /\*?\s*AT (\d{3,4} [AP]M [A-Z]{3})[^\n]*(?:\n(?!\n)[^\n]*)*/i.exec(t);
  return at ? at[0].replace(/^\*\s*/, '').replace(/\s+/g, ' ').trim().slice(0, 300) : null;
}

const only = process.argv.slice(2);
const out = only.length ? JSON.parse(readFileSync('src/seo/event-data.json', 'utf8')) : {};
for (const [slug, ev] of Object.entries(EVENTS)) {
  if (only.length && !only.includes(slug)) continue;
  const seen = new Map();
  const t0 = Date.parse(ev.start.replace('Z', ':00Z'));
  const t1 = Date.parse(ev.end.replace('Z', ':00Z'));
  for (let t = t0; t <= t1; t += 10 * 60e3) {
    const ts = new Date(t).toISOString().slice(0, 16) + 'Z';
    const j = await get(`${IEM}/geojson/sbw.py?ts=${ts}`);
    for (const f of j.features) {
      const p = f.properties;
      if (p.wfo !== ev.wfo || !['TO', 'SV'].includes(p.phenomena) || p.significance !== 'W') continue;
      if (!ev.points.some(([lat, lon]) => inside(f.geometry, lon, lat))) continue;
      seen.set(`${p.phenomena}.${p.eventid}`, { phen: p.phenomena, etn: p.eventid, year: p.year });
    }
  }
  const warnings = [];
  for (const w of seen.values()) {
    const e = await get(`${IEM}/json/vtec_event.py?wfo=${ev.wfo}&year=${w.year}&phenomena=${w.phen}&significance=W&etn=${w.etn}`);
    const updates = (e.svs || []).map((s) => ({ time: s.valid, line: headline(s.text || '') })).filter((u) => u.line);
    warnings.push({
      phen: w.phen,
      etn: w.etn,
      issued: e.utc_issue,
      expires: e.utc_expire,
      first: headline(e.report?.text || ''),
      tags: {
        tornado: /TORNADO\.\.\.(OBSERVED|RADAR INDICATED)/i.exec(e.report?.text || '')?.[1]?.toUpperCase() || null,
        emergency: /TORNADO EMERGENCY/i.test([e.report?.text, ...(e.svs || []).map((s) => s.text)].join(' ')),
      },
      counties: [...new Set((e.ugcs || []).map((u) => `${u.name}, ${u.ugc.slice(0, 2)}`))],
      updates,
      link: `${IEM}/vtec/?year=${w.year}&wfo=K${ev.wfo}&phenomena=${w.phen}&significance=W&eventid=${String(w.etn).padStart(4, '0')}`,
    });
  }
  warnings.sort((a, b) => Date.parse(a.issued) - Date.parse(b.issued));
  out[slug] = { warnings };
  console.log(slug, warnings.map((w) => `${w.phen}#${w.etn} ${w.issued}-${w.expires} updates:${w.updates.length}${w.tags.emergency ? ' EMERGENCY' : ''}`));
}
writeFileSync('src/seo/event-data.json', JSON.stringify(out, null, 1));
