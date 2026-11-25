// Builds the severe weather climatology behind /tornado-season:
// public/data/climatology/<tornado|hail|wind>.json, one map per month.
//
// Source: NOAA/NWS Storm Prediction Center severe weather database
// (https://www.spc.noaa.gov/wcm/), public domain. Tornado tracks, hail of
// 1 inch or larger (the severe size since 2010; smaller stones are left out
// for every year so the years match) and damaging wind reports, lower 48
// states, 1996-2025 (the latest 30 full years).
//
// Method: follows NOAA/NSSL's tornado climatology (Brooks, Doswell and Kay
// 2003, "Climatological estimates of local daily tornado probability for the
// United States", Weather and Forecasting 18, 626-640), by calendar month
// instead of by day of the year. For each month:
//   - each day, an 80 km box counts once if one or more reports fell in it
//     (a "tornado day" for that box), so one big outbreak doesn't outweigh
//     years of ordinary days;
//   - those are smoothed in space with a Gaussian kernel (120 km), as in
//     the paper;
//   - "greater" is the smallest area holding 35% of the month's activity,
//     "typical" the smallest holding 75%; each drawn as one smooth outline
//     (no holes, small outlying pieces left out).
// Also: the average number of reports per year in that month, and the states
// with the most (also in src/seo/climatology-summary.json for the page text).
//
// Run when a new year of data is out (update LAST_YEAR):
//   node scripts/build-climatology.mjs

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { contours } from 'd3-contour';

const FIRST_YEAR = 1996;
const LAST_YEAR = 2025;
const YEARS = LAST_YEAR - FIRST_YEAR + 1;
const BASE = 'https://www.spc.noaa.gov/wcm/data/';
const HAZARDS = {
  tornado: { file: `1950-${LAST_YEAR}_actual_tornadoes.csv`, keep: () => true },
  hail: { file: `1955-${LAST_YEAR}_hail.csv`, zip: true, keep: (r) => Number(r.mag) >= 1 },
  wind: { file: `1955-${LAST_YEAR}_wind.csv`, zip: true, keep: () => true },
};

// Grid over the lower 48 (cell centers), 0.25 degrees.
const STEP = 0.25;
const LON0 = -126;
const LAT0 = 23;
const NX = Math.round((-65 - LON0) / STEP) + 1;
const NY = Math.round((51 - LAT0) / STEP) + 1;
const SIGMA_KM = Number(process.env.SIGMA_KM) || 120; // as in Brooks et al. (2003)
const BOX_KM = 80; // "tornado day" boxes, as in Brooks et al. (2003)
const GREATER = Number(process.env.GREATER) || 0.35; // share of activity inside the core area
const TYPICAL = Number(process.env.TYPICAL) || 0.75; // share inside the wider area
const inLower48 = (lat, lon) => lat >= 24 && lat <= 50 && lon >= -125 && lon <= -66.5;

const tmp = mkdtempSync(join(tmpdir(), 'ws-clim-'));
async function download(h) {
  const res = await fetch(BASE + h.file + (h.zip ? '.zip' : ''));
  if (!res.ok) throw new Error(`${h.file}: download failed (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!h.zip) return buf.toString('utf8');
  writeFileSync(join(tmp, 'f.zip'), buf);
  execFileSync('unzip', ['-q', '-o', join(tmp, 'f.zip'), '-d', tmp]);
  return readFileSync(join(tmp, h.file), 'utf8');
}

function rows(text) {
  const lines = text.split(/\r?\n/);
  const head = lines[0].split(',');
  const col = Object.fromEntries(head.map((h, i) => [h, i]));
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const f = lines[i].split(',');
    out.push({ yr: +f[col.yr], mo: +f[col.mo], date: f[col.date], st: f[col.st], mag: f[col.mag], lat: +f[col.slat], lon: +f[col.slon] });
  }
  return out;
}

function density(points) {
  const grid = new Float64Array(NX * NY);
  const sLat = SIGMA_KM / 111.2;
  for (const [lat, lon] of points) {
    const sLon = sLat / Math.cos((lat * Math.PI) / 180);
    const cx = (lon - LON0) / STEP;
    const cy = (lat - LAT0) / STEP;
    const rx = Math.ceil((3 * sLon) / STEP);
    const ry = Math.ceil((3 * sLat) / STEP);
    for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(NY - 1, Math.ceil(cy + ry)); y++) {
      const dy = ((y - cy) * STEP) / sLat;
      for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(NX - 1, Math.ceil(cx + rx)); x++) {
        const dx = ((x - cx) * STEP) / sLon;
        const d2 = dx * dx + dy * dy;
        if (d2 < 9) grid[y * NX + x] += Math.exp(-d2 / 2);
      }
    }
  }
  return grid;
}

// Density level enclosing `share` of the total (cells weighted by their area).
function levelFor(grid, share) {
  const cells = [];
  let total = 0;
  for (let y = 0; y < NY; y++) {
    const w = Math.cos(((LAT0 + y * STEP) * Math.PI) / 180);
    for (let x = 0; x < NX; x++) {
      const v = grid[y * NX + x];
      if (v > 0) {
        cells.push([v, v * w]);
        total += v * w;
      }
    }
  }
  cells.sort((a, b) => b[0] - a[0]);
  let sum = 0;
  for (const [v, m] of cells) {
    sum += m;
    if (sum >= total * share) return v;
  }
  return 0;
}

const r2 = (n) => Math.round(n * 100) / 100;
const ringArea = (ring) => {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  return Math.abs(a / 2);
};
// One smooth area per region: outer edges only (no holes), and pieces much
// smaller than the main one left out.
function shape(grid, level) {
  const [c] = contours().size([NX, NY]).thresholds([level])(Array.from(grid));
  const outer = c.coordinates.map((poly) => poly[0].map(([x, y]) => [r2(LON0 + (x - 0.5) * STEP), r2(LAT0 + (y - 0.5) * STEP)]));
  const biggest = Math.max(0, ...outer.map(ringArea));
  return outer.filter((ring) => ringArea(ring) >= biggest * 0.15).map((ring) => [ring]);
}

// A spot for an area's label: inside `rings`, outside `avoid`, as far from
// their edges as possible (searched on a fine grid).
const inside = (ring, [x, y]) => {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
function labelSpot(polys, avoid = []) {
  const rings = polys.map((p) => p[0]);
  const holes = avoid.map((p) => p[0]);
  const edges = [...rings, ...holes].flat();
  let best = null;
  let bestD = -1;
  for (const ring of rings) {
    const xs = ring.map((p) => p[0]);
    const ys = ring.map((p) => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    for (let i = 1; i < 40; i++) {
      for (let j = 1; j < 40; j++) {
        const pt = [x0 + ((x1 - x0) * i) / 40, y0 + ((y1 - y0) * j) / 40];
        if (!inside(ring, pt) || holes.some((h) => inside(h, pt))) continue;
        const k = Math.cos((pt[1] * Math.PI) / 180);
        let d = Infinity;
        for (const e of edges) d = Math.min(d, ((e[0] - pt[0]) * k) ** 2 + (e[1] - pt[1]) ** 2);
        if (d > bestD) {
          bestD = d;
          best = pt;
        }
      }
    }
  }
  return best && [r2(best[1]), r2(best[0])]; // [lat, lon]
}

mkdirSync('public/data/climatology', { recursive: true });
const summary = { years: [FIRST_YEAR, LAST_YEAR] }; // for the page text (prerendered)
for (const [name, h] of Object.entries(HAZARDS)) {
  const all = rows(await download(h)).filter((r) => r.yr >= FIRST_YEAR && r.yr <= LAST_YEAR && inLower48(r.lat, r.lon) && h.keep(r));
  const months = [];
  for (let mo = 1; mo <= 12; mo++) {
    const list = all.filter((r) => r.mo === mo);
    // Each day, an 80 km box is "on" if one or more reports fell in it,
    // placed at the box's center.
    const seen = new Map();
    const dLat = BOX_KM / 111.2;
    for (const r of list) {
      const by = Math.floor(r.lat / dLat);
      const cLat = (by + 0.5) * dLat;
      const dLon = dLat / Math.cos((cLat * Math.PI) / 180);
      const bx = Math.floor(r.lon / dLon);
      const key = `${r.date}|${by}|${bx}`;
      if (!seen.has(key)) seen.set(key, [cLat, (bx + 0.5) * dLon]);
    }
    const grid = density([...seen.values()]);
    const states = {};
    for (const r of list) states[r.st] = (states[r.st] || 0) + 1;
    const greater = shape(grid, levelFor(grid, GREATER));
    const typical = shape(grid, levelFor(grid, TYPICAL));
    months.push({
      month: mo,
      perYear: Math.round((list.length / YEARS) * 10) / 10,
      states: Object.entries(states)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([st, n]) => [st, Math.round((n / YEARS) * 10) / 10]),
      greater,
      typical,
      labels: { greater: labelSpot(greater), typical: labelSpot(typical, greater) },
    });
  }
  const json = JSON.stringify({ hazard: name, years: [FIRST_YEAR, LAST_YEAR], source: 'NOAA/NWS Storm Prediction Center', months });
  writeFileSync(`public/data/climatology/${name}.json`, json);
  summary[name] = months.map((m) => ({ perYear: m.perYear, states: m.states }));
  console.log(`${name}: ${all.length} reports, ${(json.length / 1024).toFixed(0)} KB, per year by month: ${months.map((m) => m.perYear).join(' ')}`);
}
writeFileSync('src/seo/climatology-summary.json', JSON.stringify(summary));
rmSync(tmp, { recursive: true, force: true });
