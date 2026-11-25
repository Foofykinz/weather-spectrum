// "Terrain" basemap: satellite imagery of the land with county and state
// lines, red interstates with route shields, and town names.
//
// The imagery comes from the USGS National Map (public domain, no key, CORS
// allowed so the post maker can copy it). Roads, state lines, shields and
// names come from OpenFreeMap's vector tiles, using its "liberty" style for
// the shield images and fonts. OpenFreeMap has no US county lines, so those
// come from public/data/county-lines.json (Census, see
// scripts/build-county-lines.mjs).

const USGS = (service) => `https://basemap.nationalmap.gov/arcgis/rest/services/${service}/MapServer/tile/{z}/{y}/{x}`;

export const USGS_ATTRIBUTION =
  '<a href="https://www.usgs.gov/programs/national-geospatial-program/national-map" target="_blank" rel="noopener noreferrer">USGS The National Map</a>';

const NAME = ['coalesce', ['get', 'name_en'], ['get', 'name']];
const notMaritime = ['!=', ['get', 'maritime'], 1];
const z = (...stops) => ['interpolate', ['linear'], ['zoom'], ...stops];

// Interstate shield images, drawn here instead of taken from the map style:
// the familiar blue shield with a red band across the top and a white edge.
// The style asks for 'ws-interstate-<digits>'; when MapLibre finds it missing
// (styleimagemissing), addInterstateShield draws it.
export const SHIELD_PREFIX = 'ws-interstate-';
const SHIELD_BLUE = '#003f87';
const SHIELD_RED = '#c8102e';

export function addInterstateShield(map, id) {
  if (!id.startsWith(SHIELD_PREFIX) || map.hasImage(id)) return;
  const digits = Math.max(1, Math.min(3, Number(id.slice(SHIELD_PREFIX.length)) || 2));
  const r = 2; // pixel ratio
  const w = (digits === 3 ? 28 : 22) * r;
  const h = 22 * r;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  // Shield outline: slightly dipped top, straight upper sides, curving to a point.
  const shape = (inset) => {
    const l = inset;
    const rt = w - inset;
    const top = inset;
    const mid = w / 2;
    ctx.beginPath();
    ctx.moveTo(l, top);
    ctx.quadraticCurveTo(mid / 2 + l / 2, top + 2.5 * r, mid, top + 1.5 * r);
    ctx.quadraticCurveTo((mid + rt) / 2, top + 2.5 * r, rt, top);
    ctx.lineTo(rt, h * 0.42);
    ctx.bezierCurveTo(rt, h * 0.75, mid + w * 0.18, h * 0.86, mid, h - inset);
    ctx.bezierCurveTo(mid - w * 0.18, h * 0.86, l, h * 0.75, l, h * 0.42);
    ctx.closePath();
  };
  shape(0.5 * r);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.save();
  shape(1.6 * r);
  ctx.clip();
  ctx.fillStyle = SHIELD_BLUE;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = SHIELD_RED;
  ctx.fillRect(0, 0, w, h * 0.28);
  ctx.restore();
  map.addImage(id, ctx.getImageData(0, 0, w, h), { pixelRatio: r });
}

// liberty: OpenFreeMap's liberty style JSON. countiesUrl: absolute URL of county-lines.json.
export function terrainStyle(liberty, countiesUrl) {
  const shields = liberty.layers.filter((l) => l.id === 'highway-shield-us-interstate' || l.id === 'road_shield_us');
  const layers = [
    { id: 'background', type: 'background', paint: { 'background-color': '#2a2f2a' } },
    {
      id: 'terrain',
      type: 'raster',
      source: 'usgs',
      paint: { 'raster-brightness-max': 0.92, 'raster-saturation': -0.05, 'raster-contrast': 0.05 },
    },
    { id: 'water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water', filter: ['!=', ['get', 'brunnel'], 'tunnel'], paint: { 'fill-color': '#1f3a57' } },
    {
      id: 'roads_major',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      minzoom: 6,
      filter: ['match', ['get', 'class'], ['trunk', 'primary'], true, false],
      paint: { 'line-color': '#f1f1ee', 'line-opacity': z(6, 0.55, 10, 0.8), 'line-width': z(6, 0.6, 10, 1.4, 12, 2.2) },
    },
    {
      id: 'roads_interstate',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      minzoom: 4,
      filter: ['all', ['==', ['get', 'class'], 'motorway'], ['!=', ['get', 'ramp'], 1]],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#c0272d', 'line-width': z(4, 0.8, 7, 1.6, 10, 2.6, 12, 3.5) },
    },
    // County lines: thin and dark. State lines: black and heavier. Country: heavier still.
    {
      id: 'boundary_county',
      type: 'line',
      source: 'counties',
      minzoom: 5,
      layout: { 'line-join': 'round' },
      paint: { 'line-color': '#0a0a0a', 'line-opacity': z(5, 0.55, 8, 0.85), 'line-width': z(5, 0.6, 8, 1, 12, 1.6) },
    },
    {
      id: 'boundary_state',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'boundary',
      filter: ['all', ['==', ['get', 'admin_level'], 4], notMaritime],
      layout: { 'line-join': 'round' },
      paint: { 'line-color': '#0a0a0a', 'line-width': z(3, 0.8, 6, 1.6, 10, 2.4) },
    },
    {
      id: 'boundary_country',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'boundary',
      filter: ['all', ['==', ['get', 'admin_level'], 2], notMaritime],
      layout: { 'line-join': 'round' },
      paint: { 'line-color': '#000', 'line-width': z(3, 1.2, 6, 2.2, 10, 3) },
    },
    // Interstate shields from state zoom, in their real colors (drawn by
    // addInterstateShield); US and state route shields once zoomed in a bit more.
    ...shields.map((l) =>
      l.id === 'road_shield_us'
        ? { ...l, minzoom: 8 }
        : {
            ...l,
            minzoom: 6,
            layout: { ...l.layout, 'icon-image': ['concat', SHIELD_PREFIX, ['min', ['get', 'ref_length'], 3]], 'text-font': ['Noto Sans Bold'], 'text-offset': [0, 0.15] },
            paint: { ...l.paint, 'text-color': '#ffffff' },
          }
    ),
    {
      id: 'place_state',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'place',
      maxzoom: 7,
      filter: ['==', ['get', 'class'], 'state'],
      layout: { 'text-field': NAME, 'text-font': ['Noto Sans Bold'], 'text-size': z(3, 10, 6, 13), 'text-transform': 'uppercase', 'text-letter-spacing': 0.15, 'text-max-width': 8 },
      paint: { 'text-color': 'rgba(255,255,255,0.75)', 'text-halo-color': 'rgba(0,0,0,0.85)', 'text-halo-width': 1.4 },
    },
    {
      id: 'place_town',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'place',
      minzoom: 7,
      filter: ['==', ['get', 'class'], 'town'],
      layout: { 'text-field': NAME, 'text-font': ['Noto Sans Bold'], 'text-size': z(7, 11, 10, 14), 'text-max-width': 8 },
      paint: { 'text-color': '#f4f4f2', 'text-halo-color': 'rgba(0,0,0,0.9)', 'text-halo-width': 1.6 },
    },
    {
      id: 'place_city',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'place',
      minzoom: 4,
      filter: ['==', ['get', 'class'], 'city'],
      layout: { 'text-field': NAME, 'text-font': ['Noto Sans Bold'], 'text-size': z(4, 11, 7, 14, 10, 17), 'text-max-width': 8 },
      paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,0.9)', 'text-halo-width': 1.8 },
    },
  ];

  return {
    version: 8,
    sprite: liberty.sprite,
    glyphs: liberty.glyphs,
    sources: {
      openmaptiles: liberty.sources.openmaptiles,
      counties: { type: 'geojson', data: countiesUrl },
      usgs: {
        type: 'raster',
        tiles: [USGS('USGSImageryOnly')],
        tileSize: 256,
        maxzoom: 16,
      },
    },
    layers,
  };
}
