// Color scales used by radar legends.
//
// IMPORTANT: a legend must describe the colors that are actually on the map.
// Because our first radar images are pre-colored by the data provider, these
// colors were read directly from the provider's palette — not designed by us.
//
// Source: the color table embedded in IEM's N0Q composite image
// (https://mesonet.agron.iastate.edu/data/gis/images/4326/USCOMP/n0q_0.png),
// where palette index i maps to dBZ = -32 + 0.5 * (i - 1). The same table is
// used by IEM's single-site N0B tiles (verified by sampling tile pixels).
//
// When we start rendering raw data ourselves (velocity, CC, ZDR, ...), each
// product gets its own scale here, and we choose the colors.

export const COLOR_SCALES = {
  'iem-n0q-dbz': {
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
};

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
