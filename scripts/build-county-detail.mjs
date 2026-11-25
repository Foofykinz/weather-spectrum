// Builds detailed county lines for the terrain map, one file per state:
// public/data/counties/<STATEFP>.json, plus public/data/counties/index.json
// ({ "40": [west, south, east, north], ... }) so the map knows which states
// are on screen. The map loads a state's file only when zoomed in over it
// (see radar/terrainStyle.js, attachCountyDetail); zoomed out it uses the
// lighter public/data/county-lines.json.
//
// Source: US Census Bureau cartographic boundary file, counties 1:500,000
// (2023), public domain.
// Run when needed:  node scripts/build-county-detail.mjs

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { read } from 'shapefile';
import { topology } from 'topojson-server';
import { mesh } from 'topojson-client';

const URL = 'https://www2.census.gov/geo/tiger/GENZ2023/shp/cb_2023_us_county_500k.zip';
const dir = mkdtempSync(join(tmpdir(), 'ws-counties-'));
const res = await fetch(URL);
if (!res.ok) throw new Error(`County download failed (${res.status})`);
writeFileSync(join(dir, 'c.zip'), Buffer.from(await res.arrayBuffer()));
execFileSync('unzip', ['-q', '-o', join(dir, 'c.zip'), '-d', dir]);
const geo = await read(join(dir, 'cb_2023_us_county_500k.shp'), join(dir, 'cb_2023_us_county_500k.dbf'));
rmSync(dir, { recursive: true, force: true });

const byState = {};
for (const f of geo.features) (byState[f.properties.STATEFP] ||= []).push(f);

const out = 'public/data/counties';
mkdirSync(out, { recursive: true });
const index = {};
const r = (n) => Math.round(n * 1e4) / 1e4; // about 10 m
let total = 0;
for (const [fp, features] of Object.entries(byState)) {
  const topo = topology({ c: { type: 'FeatureCollection', features } }, 1e6);
  const lines = mesh(topo, topo.objects.c, (a, b) => a !== b);
  if (!lines.coordinates.length) continue; // single-county areas (e.g. DC)
  let w = 180, s = 90, e = -180, n = -90;
  lines.coordinates = lines.coordinates.map((line) =>
    line
      .map(([x, y]) => [r(x), r(y)])
      .filter((p, i, a) => i === 0 || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1])
  );
  for (const line of lines.coordinates) for (const [x, y] of line) {
    if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y;
  }
  // Skip lines that cross the antimeridian (western Aleutians) from the box.
  if (e - w > 180) { w = -180; e = -129; }
  index[fp] = [w, s, e, n].map((v) => Math.round(v * 100) / 100);
  const json = JSON.stringify({ type: 'Feature', properties: {}, geometry: lines });
  writeFileSync(join(out, `${fp}.json`), json);
  total += json.length;
}
writeFileSync(join(out, 'index.json'), JSON.stringify(index));
console.log(`${Object.keys(index).length} states, ${(total / 1048576).toFixed(1)} MB total`);
