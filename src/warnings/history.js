// Every NWS tornado warning issued in a period, nationwide, from the Iowa
// Environmental Mesonet archive of NWS warnings (one request per period):
//   /api/1/vtec/sbw_interval.geojson?begints=&endts=&ph=TO&only_new=true
// Each feature is one warning as first issued: its polygon, office, counties
// and times. A tornado warning is not a confirmed tornado.

const API = 'https://mesonet.agron.iastate.edu/api/1/vtec/sbw_interval.geojson';
export const FIRST_YEAR = 2002;

export const STATES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware',
  DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon',
  PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', PR: 'Puerto Rico', GU: 'Guam',
  VI: 'U.S. Virgin Islands', AS: 'American Samoa',
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Periods, in the viewer's own time zone.
//   { kind: 'year', year }  { kind: 'month', year, month (1-12) }  { kind: 'week', start: 'YYYY-MM-DD' (a Sunday) }
export function sundayOf(d) {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  s.setDate(s.getDate() - s.getDay());
  return s;
}
export function periodRange(p) {
  if (p.kind === 'year') return [new Date(p.year, 0, 1), new Date(p.year + 1, 0, 1)];
  if (p.kind === 'month') return [new Date(p.year, p.month - 1, 1), new Date(p.year, p.month, 1)];
  const [y, m, d] = p.start.split('-').map(Number);
  return [new Date(y, m - 1, d), new Date(y, m - 1, d + 7)];
}
export function periodLabel(p) {
  if (p.kind === 'year') return String(p.year);
  if (p.kind === 'month') return `${MONTHS[p.month - 1]} ${p.year}`;
  const [a, b] = periodRange(p);
  const last = new Date(b.getTime() - 86400e3);
  const f = (d, year) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(year ? { year: 'numeric' } : {}) });
  return `${f(a, a.getFullYear() !== last.getFullYear())} to ${f(last, true)}`;
}
export function shiftPeriod(p, n) {
  if (p.kind === 'year') return { ...p, year: p.year + n };
  if (p.kind === 'month') {
    const d = new Date(p.year, p.month - 1 + n, 1);
    return { kind: 'month', year: d.getFullYear(), month: d.getMonth() + 1 };
  }
  const [y, m, d] = p.start.split('-').map(Number);
  return { kind: 'week', start: ymd(new Date(y, m - 1, d + 7 * n)) };
}
export const periodInRange = (p, now = new Date()) => {
  const [a] = periodRange(p);
  return a.getFullYear() >= FIRST_YEAR && a <= now;
};

// URL form: ?year=2024 | ?month=2024-05 | ?week=2024-05-05
export function periodFromParams(params, now = new Date()) {
  const week = /^(\d{4})-(\d{2})-(\d{2})$/.exec(params.get('week') || '');
  if (week) return { kind: 'week', start: ymd(sundayOf(new Date(+week[1], +week[2] - 1, +week[3]))) };
  const month = /^(\d{4})-(\d{2})$/.exec(params.get('month') || '');
  if (month && +month[2] >= 1 && +month[2] <= 12) return { kind: 'month', year: +month[1], month: +month[2] };
  const year = /^\d{4}$/.exec(params.get('year') || '');
  if (year) return { kind: 'year', year: +year[0] };
  return { kind: 'year', year: now.getFullYear() };
}
export function periodToParams(p) {
  if (p.kind === 'year') return { year: String(p.year) };
  if (p.kind === 'month') return { month: `${p.year}-${pad(p.month)}` };
  return { week: p.start };
}

// ---- data
const stamp = (d) => d.toISOString().slice(0, 16) + 'Z';
const cache = new Map();

function warning(f) {
  const p = f.properties;
  const states = [...new Set(String(p.ugclist || '').split(/,\s*/).map((u) => u.slice(0, 2)).filter((s) => STATES[s]))];
  const ring = f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates[0][0];
  let [w, s, e, n] = [180, 90, -180, -90];
  for (const [x, y] of ring) {
    w = Math.min(w, x);
    e = Math.max(e, x);
    s = Math.min(s, y);
    n = Math.max(n, y);
  }
  return {
    key: `${p.year}.${p.wfo}.${p.eventid}`,
    wfo: p.wfo,
    eventid: p.eventid,
    year: p.year,
    issued: new Date(p.utc_issue),
    expires: new Date(p.utc_expire),
    locations: p.locations || '',
    states,
    center: [(s + n) / 2, (w + e) / 2],
    geometry: f.geometry,
    link: `https://mesonet.agron.iastate.edu/vtec/?year=${p.year}&wfo=K${p.wfo}&phenomena=TO&significance=W&eventid=${String(p.eventid).padStart(4, '0')}`,
  };
}

export function loadTornadoWarnings(p, now = new Date()) {
  const [a, b0] = periodRange(p);
  const b = b0 > now ? now : b0;
  const id = `${stamp(a)}|${stamp(b)}`;
  if (!cache.has(id)) {
    const url = `${API}?begints=${stamp(a)}&endts=${stamp(b)}&ph=TO&only_new=true`;
    cache.set(
      id,
      fetch(url)
        .then((r) => {
          if (!r.ok) throw new Error(`The warning archive returned ${r.status}`);
          return r.json();
        })
        .then((j) => {
          const seen = new Map();
          for (const f of j.features || []) {
            if (f.properties?.significance !== 'W' || f.properties?.phenomena !== 'TO' || !f.geometry) continue;
            const w = warning(f);
            // Only warnings issued inside the period (the archive also returns ones still in effect at the start).
            if (w.issued < a || w.issued >= b) continue;
            if (!seen.has(w.key)) seen.set(w.key, w);
          }
          return [...seen.values()].sort((x, y) => y.issued - x.issued);
        })
        .catch((err) => {
          cache.delete(id);
          throw err;
        })
    );
    if (cache.size > 12) cache.delete(cache.keys().next().value);
  }
  return cache.get(id);
}

// Counts for the summary: by state, by office, and by month (year view) or day.
export function summarize(list, p) {
  const byState = new Map();
  const byOffice = new Map();
  const byDay = new Map();
  for (const w of list) {
    for (const s of w.states) byState.set(s, (byState.get(s) || 0) + 1);
    byOffice.set(w.wfo, (byOffice.get(w.wfo) || 0) + 1);
    const day = ymd(w.issued);
    byDay.set(day, (byDay.get(day) || 0) + 1);
  }
  const [a, b] = periodRange(p);
  const bars = [];
  if (p.kind === 'year') {
    for (let m = 0; m < 12; m++) bars.push({ label: MONTHS[m].slice(0, 3), title: `${MONTHS[m]} ${p.year}`, count: 0 });
    for (const w of list) bars[w.issued.getMonth()].count++;
  } else {
    for (let d = new Date(a); d < b; d.setDate(d.getDate() + 1)) {
      bars.push({
        label: p.kind === 'week' ? d.toLocaleDateString('en-US', { weekday: 'short' }) : String(d.getDate()),
        title: d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
        count: byDay.get(ymd(d)) || 0,
      });
    }
  }
  const sorted = (m) => [...m.entries()].sort((x, y) => y[1] - x[1]);
  const busiest = sorted(byDay)[0];
  return { byState: sorted(byState), byOffice: sorted(byOffice), bars, busiestDay: busiest ? { day: busiest[0], count: busiest[1] } : null };
}
