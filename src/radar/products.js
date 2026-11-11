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
//   latest        async (site, signal) => { validTime, details }: newest scan
//   frames        optional async (site, count, signal) => [Date]: recent scan times, for animation
//   pollSeconds   how often to check for a new scan (checks are tiny)
//   freshness     age in minutes after which data is "delayed" / "stale"
//   legend        key into LEGENDS (see legends.js)
//   attribution   HTML credit line for the data provider
//   maxNativeZoom for tile (xyz) sources: zoom beyond which tiles are stretched
//
// `site` is the station object from stations.js ({ id: 'TLX', icao: 'KTLX', ... }).

import { fetchIemLatest, fetchIemScanTimes, iemXyzLayer, IEM_ATTRIBUTION } from './providers/iem';
import { fetchNwsLatest, fetchNwsTimes, nwsWmsLayer, NWS_ATTRIBUTION } from './providers/nws';
import { fetchLevel3Latest, probeLevel3, LEVEL3_ATTRIBUTION } from './providers/level3';
import nwsCcColors from './level3/nws-cc-colors.json';
import nwsZdrColors from './level3/nws-zdr-colors.json';
import nwsKdpColors from './level3/nws-kdp-colors.json';
import nwsEetColors from './level3/nws-eet-colors.json';
import nwsDvlColors from './level3/nws-dvl-colors.json';

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

// Elevation tilts published for Level III dual-pol products, lowest first by
// convention (N0 = lowest). Actual angles depend on the scan strategy and are
// read from each file, never assumed.
export const LEVEL3_TILTS = ['N0', 'NA', 'N1', 'NB', 'N2', 'N3'];

// Dual-polarization products decoded in the browser from NOAA Level III data
// (product codes 161 CC, 159 ZDR, 163 KDP). Values are exact, tilt-selectable,
// and can be read by tapping the map. `letter` is the product letter in the
// file name (N0C, NAX, N1K, ...).
function dualPol({ id, letter, colors, name, short, description, legend, probeFormat }) {
  return {
    id,
    name,
    short,
    group: 'Dual-Pol',
    description: `${description} Tap the map to read exact values.`,
    scope: 'site',
    coverage: 'Single radar, 300 km',
    elevation: null, // read from the file
    // Level III dual-pol products: 0.25 km range bins, 1° radials.
    resolution: 'Native Level III (0.25 km × 1°)',
    source: 'NOAA Level III',
    tiltLetter: letter,
    layer: (_site, _t, details) => ({ kind: 'canvas', canvas: details.canvas, bounds: details.bounds }),
    latest: (site, signal, { tilt = 'N0' } = {}) => fetchLevel3Latest(site, `${tilt}${letter}`, colors, signal),
    probe: probeLevel3,
    probeFormat,
    // Files reach the archive ~3-4 min after the scan; listing checks are ~1 KB.
    pollSeconds: 60,
    freshness: SITE_TIMING.freshness,
    legend,
    attribution: LEVEL3_ATTRIBUTION,
  };
}

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
    frames: (_site, n, signal) => fetchIemScanTimes('USCOMP', 'N0Q', n, signal),
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
      'The strongest echo at any height in each column, from all radar tilts, not just the lowest. Reveals cores aloft, but can overstate what reaches the ground.',
    scope: 'mosaic',
    coverage: 'Continental U.S.',
    elevation: null,
    resolution: 'National mosaic (MRMS, 0.01°)',
    source: 'NWS',
    layer: (_site, t) => withBounds(nwsWmsLayer('conus', 'cref_qcd', t), NWS_CONUS_BOUNDS),
    latest: () => fetchNwsLatest('conus', 'cref_qcd'),
    frames: (_site, n) => fetchNwsTimes('conus', 'cref_qcd', n),
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
    frames: (site, n, signal) => fetchIemScanTimes(site.id, 'N0B', n, signal),
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
    frames: (site, n) => fetchNwsTimes(site.icao, 'sr_bvel', n),
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
    frames: (site, n, signal) => fetchIemScanTimes(site.id, 'N0S', n, signal),
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
    frames: (site, n) => fetchNwsTimes(site.icao, 'bdhc', n),
    ...SITE_TIMING,
    legend: 'nws-hc',
    attribution: NWS_ATTRIBUTION,
  },
  dualPol({
    id: 'site-cc',
    letter: 'C',
    colors: nwsCcColors,
    name: 'Correlation Coefficient',
    short: 'Site CC',
    description:
      'How similar the horizontal and vertical radar returns are. Near 1 means uniform rain or snow; lower values mean mixed targets such as hail, melting snow, debris or birds.',
    legend: 'nws-cc',
    probeFormat: (v) => `CC ${v.toFixed(3)}`,
  }),
  dualPol({
    id: 'site-zdr',
    letter: 'X',
    colors: nwsZdrColors,
    name: 'Differential Reflectivity',
    short: 'Site ZDR',
    description:
      'Shape of the targets. Positive values mean flattened drops (larger raindrops); near zero means round targets such as hail, drizzle or dry snow.',
    legend: 'nws-zdr',
    probeFormat: (v) => `ZDR ${v.toFixed(2)} dB`,
  }),
  dualPol({
    id: 'site-kdp',
    letter: 'K',
    colors: nwsKdpColors,
    name: 'Specific Differential Phase',
    short: 'Site KDP',
    description:
      'Rate of phase shift through liquid water. High values mark heavy rain; it is not affected by hail or partial beam blockage. Only computed where there is enough signal.',
    legend: 'nws-kdp',
    probeFormat: (v) => `KDP ${v.toFixed(2)} °/km`,
  }),
  {
    id: 'mosaic-echo-tops',
    name: 'Echo Tops (National, 18 dBZ)',
    short: 'Mosaic ET',
    group: 'Storm structure',
    // Not the single-radar Level III Enhanced Echo Tops (EET) product.
    description:
      'Height of the highest 18 dBZ echo in each column, a quick read on storm depth. National mosaic; not the single-radar Enhanced Echo Tops (EET) product.',
    scope: 'mosaic',
    coverage: 'Continental U.S.',
    elevation: null,
    resolution: 'National mosaic (MRMS, 0.01°)',
    source: 'NWS',
    layer: (_site, t) => withBounds(nwsWmsLayer('conus', 'neet_v18', t), NWS_CONUS_BOUNDS),
    latest: () => fetchNwsLatest('conus', 'neet_v18'),
    frames: (_site, n) => fetchNwsTimes('conus', 'neet_v18', n),
    ...MRMS_TIMING,
    legend: 'nws-echo-tops',
    attribution: NWS_ATTRIBUTION,
  },
  level3Volume({
    id: 'site-eet',
    code: 'EET',
    colors: nwsEetColors,
    name: 'Enhanced Echo Tops',
    short: 'Site EET',
    description:
      'Height of the highest 18 dBZ echo above each point, from this radar’s full volume scan (Level III product 135). Tap the map to read heights; topped echoes are marked.',
    coverage: 'Single radar, ~345 km',
    resolution: 'Level III (1 km × 1°), 1 kft steps',
    legend: 'nws-eet',
    probeFormat: (v) => `EET ${v.toFixed(0)} kft`,
  }),
  level3Volume({
    id: 'site-dvl',
    code: 'DVL',
    colors: nwsDvlColors,
    name: 'Digital VIL',
    short: 'Site DVL',
    description:
      'Vertically integrated liquid: estimated liquid water in the column above each point, from the full volume scan (Level III product 134). High values often go with large hail. Tap the map to read values.',
    coverage: 'Single radar, ~460 km',
    resolution: 'Level III (1 km × 1°)',
    legend: 'nws-dvl',
    probeFormat: (v) => `VIL ${v.toFixed(1)} kg/m²`,
  }),
];

// Level III products computed from the whole volume scan (all tilts), so they
// have no single elevation angle. Decoded in the browser like the dual-pol products.
function level3Volume({ id, code, colors, name, short, description, coverage, resolution, legend, probeFormat }) {
  return {
    id,
    name,
    short,
    group: 'Storm structure',
    description,
    scope: 'site',
    coverage,
    elevation: null,
    resolution,
    source: 'NOAA Level III',
    layer: (_site, _t, details) => ({ kind: 'canvas', canvas: details.canvas, bounds: details.bounds }),
    latest: (site, signal) => fetchLevel3Latest(site, code, colors, signal),
    probe: probeLevel3,
    probeFormat,
    pollSeconds: 60,
    freshness: SITE_TIMING.freshness,
    legend,
    attribution: LEVEL3_ATTRIBUTION,
  };
}

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
