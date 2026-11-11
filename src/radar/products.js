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
import nwsRefColors from './level3/nws-ref-colors.json';
import nwsVelColors from './level3/nws-vel-colors.json';

const MS_TO_KT = 1.943844;

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

// Elevation tilts published for Level III products, lowest first by convention
// (N0 = lowest). Which tilts exist depends on the product (velocity: 3 lowest)
// and actual angles depend on the scan strategy; both are read from the
// archive and the files themselves, never assumed.
export const LEVEL3_TILTS = ['N0', 'NA', 'N1', 'NB', 'N2', 'N3'];

// Tilt-selectable products decoded in the browser from NOAA Level III data
// (153 super-res reflectivity, 154 super-res velocity, 161 CC, 159 ZDR,
// 163 KDP). Values are exact and can be read by tapping the map. `letter` is
// the product letter in the file name (N0B, NAG, N1C, ...).
function level3Tilt({ id, letter, colors, name, short, group = 'Dual-Pol', description, legend, probeFormat, coverage, resolution }) {
  return {
    id,
    name,
    short,
    group,
    description: `${description} Tap the map to read exact values.`,
    scope: 'site',
    coverage: coverage || 'Single radar, 300 km',
    elevation: null, // read from the file
    resolution: resolution || 'Native Level III (0.25 km × 1°)',
    source: 'NOAA Level III',
    tiltLetter: letter,
    layer: (_site, _t, details) => ({ kind: 'canvas', canvas: details.canvas, bounds: details.bounds }),
    latest: (site, signal, { tilt = 'N0', drawSize } = {}) => fetchLevel3Latest(site, `${tilt}${letter}`, colors, signal, { drawSize }),
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
  level3Tilt({
    id: 'site-ref-tilt',
    letter: 'B',
    colors: nwsRefColors,
    name: 'Reflectivity, All Tilts',
    short: 'Site REF',
    group: 'Reflectivity',
    description: 'Super-resolution reflectivity at any of the radar’s published elevation tilts, to look higher into storms.',
    coverage: 'Single radar, 460 km',
    resolution: 'Native Level III (0.25 km; 0.5° radials on lower tilts, 1° on upper)',
    legend: 'nws-ref',
    probeFormat: (v) => `${v.toFixed(1)} dBZ`,
  }),
  level3Tilt({
    id: 'site-vel-tilt',
    letter: 'G',
    // Files store m/s; the NWS color table and display use knots.
    colors: { ...nwsVelColors, multiplier: MS_TO_KT },
    name: 'Velocity, All Tilts',
    short: 'Site VEL',
    group: 'Velocity',
    description: 'Super-resolution base velocity at each published tilt (the three lowest). Negative = toward the radar.',
    resolution: 'Native Level III (0.25 km × 0.5°)',
    legend: 'nws-vel',
    probeFormat: (v) => `${(v * MS_TO_KT).toFixed(0)} kt (${v.toFixed(1)} m/s)`,
  }),
  level3Tilt({
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
  level3Tilt({
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
  level3Tilt({
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
    latest: (site, signal, { drawSize } = {}) => fetchLevel3Latest(site, code, colors, signal, { drawSize }),
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

// Super-res reflectivity and velocity: the lowest tilt is the base product
// (imagery, loopable); higher tilts come from the Level III all-tilt product.
// Menus show one entry with a Tilt submenu instead of two entries.
export const TILT_VARIANTS = { 'site-reflectivity': 'site-ref-tilt', 'site-velocity': 'site-vel-tilt' };
const TILT_PARENTS = Object.fromEntries(Object.entries(TILT_VARIANTS).map(([a, b]) => [b, a]));

// Menu entry a product belongs to.
export const menuProductId = (id) => TILT_PARENTS[id] || id;

// Product whose files list the tilts for a menu entry (null: no tilts).
export function tiltSourceOf(p) {
  if (TILT_VARIANTS[p.id]) return getProduct(TILT_VARIANTS[p.id]);
  return p.tiltLetter ? p : null;
}

// Selected tilt letter for a menu entry, given the current product and tilt param.
export function selectedTiltFor(menuId, productId, tiltParam) {
  if (menuProductId(productId) !== menuId) return null;
  if (TILT_VARIANTS[productId]) return 'N0';
  return LEVEL3_TILTS.includes(tiltParam) ? tiltParam : 'N0';
}

// Product id and tilt URL param to use when a tilt is picked from a menu entry.
export function productForTilt(menuId, tilt) {
  if (TILT_VARIANTS[menuId]) return tilt === 'N0' ? { product: menuId, tilt: null } : { product: TILT_VARIANTS[menuId], tilt };
  return { product: menuId, tilt: tilt === 'N0' ? null : tilt };
}

// Group products for the menu, preserving registry order. Tilt variants are
// reached through their parent's Tilt submenu, so they are left out.
export function productGroups() {
  const groups = new Map();
  for (const p of RADAR_PRODUCTS) {
    if (TILT_PARENTS[p.id]) continue;
    if (!groups.has(p.group)) groups.set(p.group, []);
    groups.get(p.group).push(p);
  }
  return [...groups.entries()];
}
