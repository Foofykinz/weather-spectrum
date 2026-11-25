// "Night" basemap: the dark map with NASA's satellite view of city lights at
// night underneath the roads, borders and place names.
//
// Imagery: NASA GIBS (Global Imagery Browse Services), public, no key, CORS
// allowed so the post maker can copy it. Tiles exist to zoom 8; MapLibre
// stretches them past that.

export const NIGHT_LAYERS = {
  // Lights only, on black (2012 composite).
  citylights: {
    url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_CityLights_2012/default/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg',
    name: 'VIIRS City Lights 2012',
  },
  // The whole Earth at night, lights and all (2016 composite).
  blackmarble: {
    url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png',
    name: 'VIIRS Black Marble 2016',
  },
};
export const NIGHT_LAYER = 'blackmarble';

export const NASA_ATTRIBUTION =
  '<a href="https://earthdata.nasa.gov/gibs" target="_blank" rel="noopener noreferrer">NASA GIBS</a> (' + NIGHT_LAYERS[NIGHT_LAYER].name + ')';

// The ground fills of the dark style would cover the lights: leave them out.
const isGroundFill = (l) => l.type === 'fill' && (l.id.startsWith('landcover') || l.id.startsWith('landuse') || l.id.startsWith('park') || l.id === 'building');

// style: OpenFreeMap's dark style JSON. which: a NIGHT_LAYERS key.
export function nightStyle(style, which = NIGHT_LAYER) {
  // Roads stay as faint lines: drawn solid they cut black stripes through the city lights.
  const layers = style.layers
    .filter((l) => !isGroundFill(l))
    .map((l) => (l.type === 'line' && l['source-layer'] === 'transportation' ? { ...l, paint: { ...l.paint, 'line-opacity': 0.3 } } : l));
  // Above the background and water, below roads, borders and names.
  const at = layers.findIndex((l) => l.type === 'line' || l.type === 'symbol');
  layers.splice(at, 0, {
    id: 'night-lights',
    type: 'raster',
    source: 'nightlights',
    paint: { 'raster-opacity': 0.95, 'raster-fade-duration': 0 },
  });
  return {
    ...style,
    sources: {
      ...style.sources,
      // tileSize 128 on a high-resolution screen: MapLibre then asks for the
      // next zoom level, one image pixel per screen pixel, as long as NASA has
      // it (zoom 8, about 500 m: the satellite's own resolution).
      nightlights: { type: 'raster', tiles: [NIGHT_LAYERS[which].url], tileSize: typeof devicePixelRatio !== 'undefined' && devicePixelRatio > 1.5 ? 128 : 256, maxzoom: 8 },
    },
    layers,
  };
}
