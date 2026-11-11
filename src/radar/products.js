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
//   scope         'mosaic' (many radars merged into one image) or
//                 'site' (one radar; requires a station to be picked)
//   coverage      human-readable area covered
//   elevation     radar beam tilt the data comes from (null for mosaics)
//   resolution    plain-English resolution note shown in the menu
//   source        short provider name shown in the menu
//   layer         (site, validTime) => map layer description for the renderer
//                 (with optional `bounds`, where data can exist):
//                 { kind: 'xyz', url } or { kind: 'wms', url, params }
//   latest        async (site, signal) => { validTime, details } — newest scan
//   pollSeconds   how often to check for a new scan (checks are tiny)
//   freshness     age in minutes after which data is "delayed" / "stale"
//   legend        key into LEGENDS (see legends.js)
//   attribution   HTML credit line for the data provider
//   maxNativeZoom for tile (xyz) sources: zoom beyond which tiles are stretched
//
// `site` is the station object from stations.js ({ id: 'TLX', icao: 'KTLX', ... }).

import { fetchIemLatest, iemXyzLayer, IEM_ATTRIBUTION } from './providers/iem';
import { fetchNwsLatest, nwsWmsLayer, NWS_ATTRIBUTION } from './providers/nws';

// Shared defaults for single-radar products: a radar finishes a volume scan
// every ~4-10 minutes depending on its scan strategy (VCP).
const SITE_TIMING = { pollSeconds: 45, freshness: { delayedAfterMin: 12, staleAfterMin: 20 } };

// Only request imagery where data can exist — saves requests when zoomed out.
// Mosaic extent from IEM's georeference file for the N0Q composite (n0q_0.wld).
const MOSAIC_BOUNDS = [[23, -126], [50, -65]];
// Single-radar products reach at most ~460 km; pad slightly.
function siteBounds(site, km = 470) {
  const dLat = km / 111;
  const dLon = km / (111 * Math.cos((site.lat * Math.PI) / 180));
  return [[site.lat - dLat, site.lon - dLon], [site.lat + dLat, site.lon + dLon]];
}
const withBounds = (layer, bounds) => ({ ...layer, bounds });
// Extent of NWS's national ("conus") MRMS layers, from their capabilities file.
const NWS_CONUS_BOUNDS = [[20, -130], [55, -60]];
const MRMS_TIMING = { pollSeconds: 60, freshness: { delayedAfterMin: 10, staleAfterMin: 20 } };

export const RADAR_PRODUCTS = [
  {
    id: 'mosaic-reflectivity',
    name: 'Base Reflectivity (National)',
    short: 'Mosaic BREF',
    group: 'Reflectivity',
    description:
      'Lowest-tilt base reflectivity from every NEXRAD radar merged into one map. Best for the big picture.',
    scope: 'mosaic',
    coverage: 'Continental U.S.',
    elevation: null,
    resolution: 'National mosaic',
    source: 'IEM',
    layer: (_site, t) => withBounds(iemXyzLayer('USCOMP', 'N0Q', t), MOSAIC_BOUNDS),
    latest: (_site, signal) => fetchIemLatest('USCOMP', 'N0Q', signal),
    // The mosaic is rebuilt every 5 minutes, and takes ~2 minutes to process.
    pollSeconds: 60,
    freshness: { delayedAfterMin: 12, staleAfterMin: 25 },
    legend: 'iem-n0q-dbz',
    attribution: IEM_ATTRIBUTION,
    maxNativeZoom: 10,
  },
  {
    id: 'mosaic-composite',
    name: 'Composite Reflectivity (National)',
    short: 'Mosaic CREF',
    group: 'Reflectivity',
    description:
      'The strongest echo at any height in each column, from all radar tilts — not just the lowest. Reveals cores aloft, but can overstate what reaches the ground.',
    scope: 'mosaic',
    coverage: 'Continental U.S.',
    elevation: null,
    resolution: 'National mosaic (MRMS, 0.01°)',
    source: 'NWS',
    layer: (_site, t) => withBounds(nwsWmsLayer('conus', 'cref_qcd', t), NWS_CONUS_BOUNDS),
    latest: () => fetchNwsLatest('conus', 'cref_qcd'),
    // MRMS mosaics update every 2 minutes, ~2 minutes after the scan time.
    ...MRMS_TIMING,
    legend: 'nws-cref',
    attribution: NWS_ATTRIBUTION,
  },
  {
    id: 'site-reflectivity',
    name: 'Super-Res Base Reflectivity',
    short: 'Site BREF',
    group: 'Reflectivity',
    description:
      'Lowest-tilt super-resolution reflectivity from one radar. Sharper detail for storm structure.',
    scope: 'site',
    coverage: 'Single radar, ~230 km range',
    elevation: '0.5°',
    resolution: 'Super-resolution',
    source: 'IEM',
    layer: (site, t) => withBounds(iemXyzLayer(site.id, 'N0B', t), siteBounds(site)),
    latest: (site, signal) => fetchIemLatest(site.id, 'N0B', signal),
    ...SITE_TIMING,
    legend: 'iem-n0q-dbz',
    attribution: IEM_ATTRIBUTION,
    maxNativeZoom: 11,
  },
  {
    id: 'site-velocity',
    name: 'Super-Res Base Velocity',
    short: 'Site BVEL',
    group: 'Velocity',
    description:
      'Wind speed toward or away from the radar, at full super-resolution. Use it to spot rotation and damaging winds.',
    scope: 'site',
    coverage: 'Single radar',
    elevation: '0.5°',
    resolution: 'Super-resolution',
    source: 'NWS',
    layer: (site, t) => withBounds(nwsWmsLayer(site.icao, 'sr_bvel', t), siteBounds(site)),
    latest: (site) => fetchNwsLatest(site.icao, 'sr_bvel'),
    ...SITE_TIMING,
    legend: 'nws-sr-bvel',
    attribution: NWS_ATTRIBUTION,
  },
  {
    id: 'site-srv',
    name: 'Storm-Relative Velocity',
    short: 'Site SRV',
    group: 'Velocity',
    description:
      'Velocity with the average storm motion removed, which makes rotation easier to see. Lower resolution: 16 coarse levels.',
    scope: 'site',
    coverage: 'Single radar',
    elevation: '0.5°',
    // Level III product 56: 1 km x 1° gates, 16 data levels.
    resolution: 'Low resolution (1 km, 16 levels)',
    source: 'IEM',
    layer: (site, t) => withBounds(iemXyzLayer(site.id, 'N0S', t), siteBounds(site)),
    latest: (site, signal) => fetchIemLatest(site.id, 'N0S', signal),
    ...SITE_TIMING,
    legend: 'iem-n0s',
    attribution: IEM_ATTRIBUTION,
    maxNativeZoom: 11,
  },
  {
    id: 'site-hc',
    name: 'Hydrometeor Classification',
    short: 'Site HC',
    group: 'Dual-Pol',
    description:
      "The radar algorithm's best guess at what each echo is: rain, snow, hail, clutter, birds and more.",
    scope: 'site',
    coverage: 'Single radar',
    elevation: '0.5°',
    resolution: 'Categorical',
    source: 'NWS',
    layer: (site, t) => withBounds(nwsWmsLayer(site.icao, 'bdhc', t), siteBounds(site)),
    latest: (site) => fetchNwsLatest(site.icao, 'bdhc'),
    ...SITE_TIMING,
    legend: 'nws-hc',
    attribution: NWS_ATTRIBUTION,
  },
  {
    id: 'mosaic-echo-tops',
    name: 'Echo Tops (National, 18 dBZ)',
    short: 'Mosaic ET',
    group: 'Storm structure',
    // Not the single-radar Level III Enhanced Echo Tops (EET) product.
    description:
      'Height of the highest 18 dBZ echo in each column — a quick read on storm depth. National mosaic; not the single-radar Enhanced Echo Tops (EET) product.',
    scope: 'mosaic',
    coverage: 'Continental U.S.',
    elevation: null,
    resolution: 'National mosaic (MRMS, 0.01°)',
    source: 'NWS',
    layer: (_site, t) => withBounds(nwsWmsLayer('conus', 'neet_v18', t), NWS_CONUS_BOUNDS),
    latest: () => fetchNwsLatest('conus', 'neet_v18'),
    ...MRMS_TIMING,
    legend: 'nws-echo-tops',
    attribution: NWS_ATTRIBUTION,
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
