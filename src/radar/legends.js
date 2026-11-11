// Radar legends.
//
// IMPORTANT: a legend must describe the colors that are actually on the map.
// All imagery we show today is pre-colored by its provider, so every legend
// below comes from that provider's own palette or official legend, and was
// checked against the colors in live imagery. Nothing here is designed by us.
//
// Legend types:
//   gradient    continuous scale drawn as hard-edged bands with ticks
//   image       the provider's official legend image, shown as-is
//   categories  labeled color swatches for classified (non-numeric) data
//   levels      a fixed set of data levels whose values depend on the scan
//   ramps       continuous color ramps per value band, hard edges between bands

import nwsSrBvelLegend from './legend-images/nws-sr-bvel.png';
import nwsBrefQcdLegend from './legend-images/nws-bref-qcd.png';
import nwsCcColors from './level3/nws-cc-colors.json';
import nwsZdrColors from './level3/nws-zdr-colors.json';
import nwsKdpColors from './level3/nws-kdp-colors.json';
import nwsEetColors from './level3/nws-eet-colors.json';
import nwsDvlColors from './level3/nws-dvl-colors.json';
import nwsRefColors from './level3/nws-ref-colors.json';
import nwsVelColors from './level3/nws-vel-colors.json';

// Keep only the part of a long color table that falls inside the legend's
// range; the band that straddles `min` starts at `min`.
function clipStops(stops, min, max) {
  const inside = stops.filter(([v]) => v > min && v < max);
  const below = stops.filter(([v]) => v <= min).pop();
  return below ? [[min, below[1]], ...inside] : inside;
}

export const LEGENDS = {
  // IEM N0Q / N0B reflectivity. Source: palette embedded in IEM's N0Q
  // composite PNG (index i -> dBZ = -32 + 0.5 * (i - 1)); the same palette is
  // used by IEM's single-site N0B tiles (verified by sampling tile pixels).
  'iem-n0q-dbz': {
    type: 'gradient',
    units: 'dBZ',
    // [lower bound of band, color]. Each color covers 2.5 dBZ.
    stops: [
      [-10, '#cfd2b4'], [-7.5, '#bdc1b4'], [-5, '#adb3b4'], [-2.5, '#9aa2b4'],
      [0, '#9098b4'], [2.5, '#7886ae'], [5, '#6376a8'], [7.5, '#4b64a1'],
      [10, '#4568a6'], [12.5, '#518bbb'], [15, '#60b4d4'], [17.5, '#6fd6e8'],
      [20, '#43d67e'], [22.5, '#10cd17'], [25, '#0eb314'], [27.5, '#0d9e11'],
      [30, '#0b840e'], [32.5, '#096f0c'], [35, '#327308'], [37.5, '#98a806'],
      [40, '#ffe200'], [42.5, '#ffc400'], [45, '#ffac00'], [47.5, '#ff8f00'],
      [50, '#f80000'], [52.5, '#cd0000'], [55, '#aa0000'], [57.5, '#7f0000'],
      [60, '#ffeaff'], [62.5, '#ffb3ff'], [65, '#f960fa'], [67.5, '#ea2bec'],
      [70, '#a400f7'], [72.5, '#7900e2'], [75, '#05eaf0'], [77.5, '#05ccd0'],
    ],
    max: 80,
    ticks: [0, 10, 20, 30, 40, 50, 60, 70],
  },

  // NWS super-resolution base velocity (radar.weather.gov "SR_BVEL").
  // The NWS color scale is not linear in knots, so instead of re-drawing it
  // (and risking mislabeled speeds) we show NWS's official legend image:
  // https://www.weather.gov/images/nws/radarfaq/SRBVEL_CT.png
  // Units and sign convention per https://www.weather.gov/radarfaq
  'nws-sr-bvel': {
    type: 'image',
    units: 'knots',
    src: nwsSrBvelLegend,
    alt: 'NWS base velocity color scale from -100 to +100 knots, with range folded (RF) at the left',
    note: 'Negative (green/blue) = toward the radar · positive (red) = away · RF = range folded',
  },

  // NWS national composite reflectivity (radar.weather.gov "CREF.QCD").
  // NWS uses its base reflectivity legend for this product
  // (https://www.weather.gov/images/nws/radarfaq/BREFQCD_CT.png, per
  // https://www.weather.gov/radarfaq). Live CREF imagery matches it closely
  // (median color difference 0, 95% of pixels within 2 RGB units).
  'nws-cref': {
    type: 'image',
    units: 'dBZ',
    src: nwsBrefQcdLegend,
    alt: 'NWS reflectivity color scale from about -30 to 75 dBZ',
    note: 'Highest reflectivity found anywhere in each vertical column, from all radar tilts.',
  },

  // NWS national echo tops (radar.weather.gov "NEET.V18").
  // NWS's published legend image does NOT match the live imagery, so it is
  // not used. Instead the color→height mapping was measured by pairing every
  // pixel of the NWS image with NOAA MRMS EchoTop_18 data (km MSL) for the
  // same 2-minute timestamp on the identical 0.01° grid: 530 colors, no
  // overlapping height ranges, confirmed on a second scan. Within each
  // 10 kft band the color ramps from dark to bright.
  'nws-echo-tops': {
    type: 'ramps',
    units: 'kft MSL',
    min: 0,
    max: 65,
    ramps: [
      [0, 10, '#49b7b9', '#07f9fd'],
      [10, 20, '#020080', '#0200fc'],
      [20, 30, '#018001', '#02fb02'],
      [30, 40, '#807d01', '#faf602'],
      [40, 50, '#810000', '#f50000'],
      [50, 60, '#c0c0c0', '#f7f7f7'],
      // Only one sample above 60 kft was observed; shown as a single color.
      [60, 65, '#dc00e0', '#dc00e0'],
    ],
    ticks: [10, 20, 30, 40, 50, 60],
    note: 'Height of the highest 18 dBZ echo, in thousands of feet above sea level.',
  },

  // Correlation coefficient, drawn by us from Level III data values using the
  // official NWS CC color table — the same table the decoder colors with, so
  // the legend matches the map by construction.
  'nws-cc': {
    type: 'gradient',
    units: 'CC (unitless)',
    // The NWS table's first entry covers everything below 0.2083; start the bar at 0.2.
    stops: [[0.2, nwsCcColors.stops[0][1]], ...nwsCcColors.stops.slice(1)],
    max: 1.05,
    ticks: [0.2, 0.4, 0.6, 0.8, 0.9, 1.0],
    note: 'Near 1 = uniform targets (rain, snow) · lower = mixed or irregular targets (hail, melting, debris, birds/insects). Tap the map to read a value.',
  },

  // Super-res reflectivity at all tilts (Level III 153), official NWS table.
  'nws-ref': {
    type: 'gradient',
    units: 'dBZ',
    stops: clipStops(nwsRefColors.stops, -30, 80),
    max: 80,
    ticks: [-20, 0, 10, 20, 30, 40, 50, 60, 70],
    note: 'Tap the map to read a value.',
  },

  // Super-res velocity at all tilts (Level III 154), official NWS table (knots).
  'nws-vel': {
    type: 'gradient',
    units: 'knots',
    stops: clipStops(nwsVelColors.stops, -100, 100),
    max: 100,
    ticks: [-100, -50, -25, 0, 25, 50, 100],
    note: 'Negative = toward the radar · positive = away · purple = range folded. Tap the map to read a value.',
  },

  // Differential reflectivity, drawn from Level III values with the official
  // NWS ZDR color table. The table's first entry covers everything below -4 dB.
  'nws-zdr': {
    type: 'gradient',
    units: 'dB',
    stops: [[-4.5, nwsZdrColors.stops[0][1]], ...nwsZdrColors.stops.slice(1)],
    max: 8,
    ticks: [-4, -2, 0, 2, 4, 6, 8],
    note: 'Positive = horizontally flattened targets (large raindrops) · near 0 = round or tumbling targets (hail, drizzle, dry snow). Tap the map to read a value.',
  },

  // Specific differential phase, drawn from Level III values with the official
  // NWS KDP color table. Only computed where the radar has enough signal.
  'nws-kdp': {
    type: 'gradient',
    units: '°/km',
    stops: nwsKdpColors.stops,
    max: 10,
    ticks: [0, 2, 4, 6, 8, 10],
    note: 'Higher values mark heavier liquid water content. Blank areas mean KDP was not computed there. Tap the map to read a value.',
  },

  // Enhanced Echo Tops (Level III 135), official NWS EET color table.
  'nws-eet': {
    type: 'gradient',
    units: 'kft',
    stops: nwsEetColors.stops,
    max: 71,
    ticks: [0, 10, 20, 30, 40, 50, 60, 70],
    note: 'Highest 18 dBZ echo, thousands of feet. Tap the map to read a height. Single-radar product; storms far from the radar are only sampled at higher altitudes.',
  },

  // Digital VIL (Level III 134), official NWS Digital VIL color table.
  'nws-dvl': {
    type: 'gradient',
    units: 'kg/m²',
    stops: nwsDvlColors.stops,
    max: 80,
    ticks: [0, 10, 20, 30, 40, 50, 60, 70, 80],
    note: 'Estimated liquid water in the column. Tap the map to read a value.',
  },

  // NWS hydrometeor classification (radar.weather.gov "BDHC").
  // Categories and colors from NWS's official legend
  // (https://www.weather.gov/images/nws/radarfaq/BDHC_CT.png) and the NWS
  // radar color tables (training.weather.gov/wdtd, NWS-ColorTables.xlsx).
  // Every color seen in live BDHC imagery matches this list exactly.
  // Hail size classes (LH, GH) follow NSSL's Hail Size Discrimination Algorithm.
  'nws-hc': {
    type: 'categories',
    items: [
      { code: 'BI', name: 'Biological', color: '#9c9c9c' },
      { code: 'GC', name: 'Ground clutter', color: '#767676' },
      { code: 'IC', name: 'Ice crystals', color: '#ffb0b0' },
      { code: 'DS', name: 'Dry snow', color: '#00ffff' },
      { code: 'WS', name: 'Wet snow', color: '#0090ff' },
      { code: 'RA', name: 'Rain', color: '#00fb90' },
      { code: 'HR', name: 'Heavy rain', color: '#00bb00' },
      { code: 'BD', name: 'Big drops', color: '#d0d060' },
      { code: 'GR', name: 'Graupel', color: '#d28484' },
      { code: 'HA', name: 'Hail with rain', color: '#ff0000', hail: true },
      { code: 'LH', name: 'Large hail (≈1–2 in)', color: '#a01414', hail: true },
      { code: 'GH', name: 'Giant hail (≈2+ in)', color: '#ffff00', hail: true },
      { code: 'UK', name: 'Unknown', color: '#e700ff' },
      { code: 'RF', name: 'Range folded', color: '#77007d' },
    ],
    note: 'Computer algorithm estimate of the most likely target type. Hail categories are radar estimates, not confirmed ground reports.',
  },

  // IEM storm-relative velocity (Level III product 56, "N0S").
  // N0S has 14 velocity data levels whose knot values depend on the radar's
  // operating mode (decoded from raw N0S product headers). IEM colors each
  // data level with a mode-specific palette (read from IEM's own N0S images).
  'iem-n0s': {
    type: 'levels',
    units: 'knots',
    rf: '#9000a0',
    modes: {
      precip: {
        label: 'Precipitation mode',
        levels: [-100, -75, -60, -40, -20, -10, -1, 0, 10, 20, 40, 60, 75, 100],
        colors: ['#02fc02', '#02fc02', '#02fc02', '#01e401', '#07ac04', '#068f03', '#7c977b',
                 '#987777', '#a20000', '#b90000', '#ef0000', '#fe0000', '#fe0000', '#fe0000'],
      },
      clear: {
        label: 'Clear-air mode',
        levels: [-64, -50, -36, -26, -20, -10, -1, 0, 10, 20, 26, 36, 50, 64],
        colors: ['#02fc02', '#02fc02', '#01e401', '#01c501', '#07ac04', '#068f03', '#7c977b',
                 '#987777', '#a20000', '#b90000', '#d80000', '#ef0000', '#fe0000', '#fe0000'],
      },
    },
    note: 'Negative (green) = toward the radar · positive (red) = away, after removing storm motion · coarse 16-level product',
  },
};

// Volume Coverage Patterns used in clear-air mode; all others are precipitation mode.
const CLEAR_AIR_VCPS = new Set([31, 32, 35]);
export function radarMode(vcp) {
  if (vcp == null) return null;
  return CLEAR_AIR_VCPS.has(Number(vcp)) ? 'clear' : 'precip';
}

// Build a CSS gradient with hard edges between bands, so the legend shows
// discrete colors exactly as the radar image does (no invented blends).
export function legendGradient(scale) {
  const { stops, max } = scale;
  const min = stops[0][0];
  const span = max - min;
  const parts = stops.map(([value, color], i) => {
    const start = ((value - min) / span) * 100;
    const end = (((i + 1 < stops.length ? stops[i + 1][0] : max) - min) / span) * 100;
    return `${color} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
  });
  return `linear-gradient(to right, ${parts.join(', ')})`;
}

export function tickPosition(scale, value) {
  const min = scale.min ?? scale.stops[0][0];
  return ((value - min) / (scale.max - min)) * 100;
}

// Smooth inside each band, hard edge between bands.
export function rampGradient(legend) {
  const pos = (v) => (((v - legend.min) / (legend.max - legend.min)) * 100).toFixed(2);
  const parts = legend.ramps.flatMap(([from, to, c1, c2]) => [`${c1} ${pos(from)}%`, `${c2} ${pos(to)}%`]);
  return `linear-gradient(to right, ${parts.join(', ')})`;
}
