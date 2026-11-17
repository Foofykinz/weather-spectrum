// Event mode for the broadcast: which warnings take over the screen, in what
// order, and the on-screen narration. The narration only quotes the NWS
// warning itself (location and motion, hazard, source, impacts, towns in the
// path); nothing is written by us.

const IEM = 'https://mesonet.agron.iastate.edu';

// Serious enough to interrupt the tour. Ordinary severe thunderstorm,
// flood and flash flood warnings stay in the crawl.
export function isEventWorthy(w) {
  const phen = w.type?.phen;
  if (w.danger === 'emergency') return true; // tornado / flash flood emergency
  if (phen === 'TO' || phen === 'EW') return true;
  if (phen === 'SV' && w.danger === 'high') return true; // destructive damage threat
  return false;
}

export function eventRank(w) {
  if (w.danger === 'emergency') return 0;
  if (w.type.phen === 'TO' && w.danger === 'high') return 1; // PDS tornado warning
  if (w.type.phen === 'TO' && w.tornado === 'OBSERVED') return 2;
  if (w.type.phen === 'TO') return 3;
  if (w.type.phen === 'EW') return 4;
  return 5;
}

// Most dangerous first; newest first among equals.
export const sortEvents = (list) => [...list].sort((a, b) => eventRank(a) - eventRank(b) || Date.parse(b.sent || 0) - Date.parse(a.sent || 0));

// Bounding box [[s, w], [n, e]] and center of a warning polygon.
export function boundsOf(geometry) {
  const pts = [];
  const walk = (c) => (typeof c[0] === 'number' ? pts.push(c) : c.forEach(walk));
  walk(geometry.coordinates);
  const lats = pts.map((p) => p[1]);
  const lons = pts.map((p) => p[0]);
  const box = [[Math.min(...lats), Math.min(...lons)], [Math.max(...lats), Math.max(...lons)]];
  return { box, center: [(box[0][0] + box[1][0]) / 2, (box[0][1] + box[1][1]) / 2] };
}

const squash = (s) => s.replace(/\s+/g, ' ').trim();

// Lines quoted from the warning text: [{ label, text }]
export function narration(text) {
  if (!text) return [];
  const lines = [];
  const paras = text.split(/\n\s*\n/).map((p) => p.replace(/^\s*\*\s*/, ''));
  const at = paras.find((p) => /\bAt \d{1,4} ?[AP]M\b/i.test(p));
  if (at) lines.push({ label: 'Storm', text: squash(at) });
  for (const key of ['HAZARD', 'SOURCE', 'IMPACT']) {
    const m = new RegExp(`${key}\\.\\.\\.([\\s\\S]+?)(?=\\n\\s*\\n|\\n\\s*[A-Z]{4,}\\.\\.\\.|$)`).exec(text);
    if (m) lines.push({ label: key[0] + key.slice(1).toLowerCase(), text: squash(m[1]) });
  }
  const near = paras.find((p) => /will be near|Locations impacted include|Other locations impacted/i.test(p));
  if (near) {
    const t = squash(near);
    lines.push({ label: 'In the path', text: t.length > 260 ? `${t.slice(0, t.lastIndexOf(' ', 257))}...` : t });
  }
  return lines;
}

// Past warnings (replay): the polygon archive has no text, so fetch the
// warning's own text and counties from IEM's record of the event.
const pastCache = new Map();
export function pastDetails(w, t) {
  const e = w.event;
  if (!e) return Promise.resolve(null);
  const url = `${IEM}/json/vtec_event.py?wfo=${e.wfo}&year=${e.year}&phenomena=${e.phen}&significance=${e.sig}&etn=${e.etn}`;
  if (!pastCache.has(url)) {
    pastCache.set(
      url,
      fetch(url)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
    );
  }
  return pastCache.get(url).then((j) => {
    if (!j) return null;
    const ugcs = (j.ugcs || []).filter((u) => Date.parse(u.utc_issue) <= t && Date.parse(u.utc_expire) > t);
    const area = [...new Set((ugcs.length ? ugcs : j.ugcs || []).map((u) => `${u.name}, ${u.ugc.slice(0, 2)}`))].join('; ');
    // The newest statement issued by then (warning or follow-up), else the warning.
    const texts = [j.report, ...(j.svs || [])].filter((x) => x && Date.parse(x.valid) <= t);
    const text = (texts[texts.length - 1] || j.report)?.text || '';
    return { area: area || null, text };
  });
}
