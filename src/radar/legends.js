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

import nwsSrBvelLegend from './legend-images/nws-sr-bvel.png';

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
  const min = scale.stops[0][0];
  return ((value - min) / (scale.max - min)) * 100;
}
