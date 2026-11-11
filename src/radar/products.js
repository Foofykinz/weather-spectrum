// Radar product registry.
//
// Every radar product the app can show is described here, in one place.
// Adding a product means adding an entry: the map, legend, status bar and
// product menu all read from this list.
//
// Products differ a lot, so each entry spells out its own behavior instead of
// assuming everything works like reflectivity:
//
//   id            unique key (also used in the page URL)
//   name / short  menu label and compact label
//   group         heading in the product menu
//   description   one plain-English sentence for the menu
//   scope         'mosaic' (many radars merged into one national image) or
//                 'site' (one radar; requires a station to be picked)
//   coverage      human-readable area covered
//   render        how it gets on screen. Today: { type: 'tiles', tileUrl(site, validTime) }.
//                 Later: WMS images, our own processed tiles from R2, etc.
//   latest        async (site, signal) => { validTime, details } — newest scan
//   pollSeconds   how often to check for a new scan (checks are tiny)
//   freshness     age in minutes after which data is "delayed" / "stale"
//   colorScale    key into COLOR_SCALES (legend)
//   attribution   HTML credit line for the data provider
//   maxNativeZoom zoom beyond which tiles are stretched instead of requested

import { fetchIemLatest, iemTileUrl, IEM_ATTRIBUTION } from './providers/iem';

export const RADAR_PRODUCTS = [
  {
    id: 'mosaic-reflectivity',
    name: 'National Reflectivity Mosaic',
    short: 'Mosaic BREF',
    group: 'Reflectivity',
    description:
      'Lowest-tilt base reflectivity from every NEXRAD radar merged into one map. Best for the big picture.',
    scope: 'mosaic',
    coverage: 'Continental U.S.',
    render: { type: 'tiles', tileUrl: (_site, t) => iemTileUrl('USCOMP', 'N0Q', t) },
    latest: (_site, signal) => fetchIemLatest('USCOMP', 'N0Q', signal),
    // The mosaic is rebuilt every 5 minutes, and takes ~2 minutes to process.
    pollSeconds: 60,
    freshness: { delayedAfterMin: 12, staleAfterMin: 25 },
    colorScale: 'iem-n0q-dbz',
    attribution: IEM_ATTRIBUTION,
    maxNativeZoom: 10,
  },
  {
    id: 'site-reflectivity',
    name: 'Super-Res Base Reflectivity',
    short: 'Site BREF',
    group: 'Reflectivity',
    description:
      'Lowest-tilt (0.5°) super-resolution reflectivity from one radar. Sharper detail for storm structure.',
    scope: 'site',
    coverage: 'Single radar, ~230 km range',
    render: { type: 'tiles', tileUrl: (site, t) => iemTileUrl(site, 'N0B', t) },
    latest: (site, signal) => fetchIemLatest(site, 'N0B', signal),
    // A radar finishes a volume every ~4-10 min depending on its scan strategy (VCP).
    pollSeconds: 45,
    freshness: { delayedAfterMin: 12, staleAfterMin: 20 },
    colorScale: 'iem-n0q-dbz',
    attribution: IEM_ATTRIBUTION,
    maxNativeZoom: 11,
  },
];

export const DEFAULT_PRODUCT_ID = 'mosaic-reflectivity';

export function getProduct(id) {
  return RADAR_PRODUCTS.find((p) => p.id === id) || RADAR_PRODUCTS[0];
}

// Group products for the menu, preserving registry order.
export function productGroups() {
  const groups = new Map();
  for (const p of RADAR_PRODUCTS) {
    if (!groups.has(p.group)) groups.set(p.group, []);
    groups.get(p.group).push(p);
  }
  return [...groups.entries()];
}
