// Builds public/data/county-lines.json: US county borders as GeoJSON lines,
// for the terrain map. Only borders between two counties in the same state
// are kept (state and country lines come from the vector map), and each
// shared border is drawn once.
//
// Source: us-atlas 3.0.1 (ISC), made from the US Census Bureau's 1:10,000,000
// cartographic boundary files (public domain).
// Run when needed:  node scripts/build-county-lines.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { mesh } from 'topojson-client';

const URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/counties-10m.json';
const res = await fetch(URL);
if (!res.ok) throw new Error(`County download failed (${res.status})`);
const topo = await res.json();

const state = (f) => String(f.id).slice(0, 2);
const lines = mesh(topo, topo.objects.counties, (a, b) => a !== b && state(a) === state(b));
const round = (n) => Math.round(n * 1000) / 1000;
lines.coordinates = lines.coordinates.map((line) => line.map(([x, y]) => [round(x), round(y)]));

mkdirSync('public/data', { recursive: true });
const json = JSON.stringify({ type: 'Feature', properties: {}, geometry: lines });
writeFileSync('public/data/county-lines.json', json);
console.log(`${lines.coordinates.length} lines, ${(json.length / 1024).toFixed(0)} KB`);
