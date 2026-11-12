// Builds public/data/ugc-shapes.json: the outlines of every NWS county and
// marine zone (the areas tornado and severe thunderstorm watches are issued
// for), keyed by the NWS UGC code (e.g. OKC109, ANZ430).
//
// Source: the IEM copy of the NWS UGC database (current definitions).
// Run when NWS county/zone definitions change:  node scripts/build-ugc-shapes.mjs
//
// Format: { "OKC109": [[x0, y0, dx, dy, dx, dy, ...], ...ring], ... }
// Coordinates are lon/lat x 100 (the source's 0.01° precision, about 1 km),
// first point absolute, then differences. Holes and islands are kept as rings;
// the browser fills them with the even-odd rule.

import { writeFileSync, mkdirSync } from 'node:fs';

const URL = 'https://mesonet.agron.iastate.edu/api/1/nws/ugcs.geojson';
const MARINE = /^(AM|AN|GM|LC|LE|LH|LM|LO|LS|PH|PK|PM|PS|PZ|SL)Z/;

const res = await fetch(URL);
if (!res.ok) throw new Error(`UGC download failed (${res.status})`);
const geo = await res.json();

const out = {};
let rings = 0;
for (const f of geo.features) {
  const ugc = f.properties.ugc;
  if (!f.geometry || !(ugc[2] === 'C' || MARINE.test(ugc))) continue;
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  const list = (out[ugc] ||= []);
  for (const poly of polys) {
    for (const ring of poly) {
      const enc = [];
      let px = 0;
      let py = 0;
      for (const [lon, lat] of ring) {
        const x = Math.round(lon * 100);
        const y = Math.round(lat * 100);
        if (enc.length && x === px && y === py) continue;
        enc.push(enc.length ? x - px : x, enc.length ? y - py : y);
        px = x;
        py = y;
      }
      if (enc.length >= 6) {
        list.push(enc);
        rings++;
      }
    }
  }
}

mkdirSync('public/data', { recursive: true });
const json = JSON.stringify(out);
writeFileSync('public/data/ugc-shapes.json', json);
console.log(`${Object.keys(out).length} areas, ${rings} rings, ${(json.length / 1024).toFixed(0)} KB`);
