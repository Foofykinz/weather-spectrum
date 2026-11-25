import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import { nightStyle, NASA_ATTRIBUTION } from '../../radar/nightStyle';
import { terrainStyle, addInterstateShield, attachCountyDetail, SHIELD_PREFIX, USGS_ATTRIBUTION } from '../../radar/terrainStyle';

// Dark basemap from OpenFreeMap (https://openfreemap.org/): free, no API key,
// commercial use allowed, attribution required.
//
// OpenFreeMap serves *vector* map data, which Leaflet can't draw on its own,
// so MapLibre GL renders it inside the Leaflet map. MapLibre is large, so it's
// loaded only when the radar page opens, so the rest of the site stays light.
//
// The style is split into two layers so the radar sits in between:
//   below radar: land, water, roads           (Leaflet "tilePane")
//   above radar: borders + place names        (our "labels" pane)
// That keeps towns and state lines readable inside heavy precipitation.

export const STYLE_URLS = {
  dark: 'https://tiles.openfreemap.org/styles/dark',
  light: 'https://tiles.openfreemap.org/styles/positron',
  terrain: 'https://tiles.openfreemap.org/styles/liberty', // shield images and fonts; see radar/terrainStyle
  night: 'https://tiles.openfreemap.org/styles/dark', // plus NASA city lights; see radar/nightStyle
};

export const OPENFREEMAP_ATTRIBUTION =
  '<a href="https://openfreemap.org/" target="_blank" rel="noopener noreferrer">OpenFreeMap</a> ' +
  '<a href="https://www.openmaptiles.org/" target="_blank" rel="noopener noreferrer">&copy; OpenMapTiles</a> ' +
  'Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>';

const isOverlayLayer = (layer) => layer.type === 'symbol' || layer.id.startsWith('boundary');

// The dark style's place names are dim gray, which disappears on top of
// radar colors. Brighten them and add a dark outline so towns stay readable.
const legiblePlaceName = (layer) =>
  layer.type === 'symbol' && layer.id.startsWith('place')
    ? {
        ...layer,
        paint: { ...layer.paint, 'text-color': '#d7dde6', 'text-halo-color': 'rgba(0,0,0,0.9)', 'text-halo-width': 1.6 },
      }
    : layer;

// Light theme: OpenFreeMap Positron, recolored ("slate"): gray-blue land,
// muted blue water, and solid state and country lines that show at national
// zoom (Positron's own are pale and dashed).
const SLATE = { land: '#cfd5dd', land2: '#c7ced8', water: '#8ea6bb', state: '#7b8697', country: '#4b5563', stateLabel: '#374151' };
export function slateStyle(style) {
  const layers = style.layers.map((l) => {
    const paint = { ...(l.paint || {}) };
    let extra = {};
    if (l.id === 'background') paint['background-color'] = SLATE.land;
    else if (l.id === 'water' || l.id === 'waterway') paint[l.type === 'fill' ? 'fill-color' : 'line-color'] = SLATE.water;
    else if (l.type === 'fill' && (l.id === 'park' || l.id.startsWith('landuse') || l.id.startsWith('landcover'))) paint['fill-color'] = SLATE.land2;
    else if (l.id === 'boundary_3') {
      paint['line-color'] = SLATE.state;
      delete paint['line-dasharray'];
      paint['line-width'] = ['interpolate', ['linear'], ['zoom'], 3, 0.6, 7, 1.2, 11, 2];
      extra = { minzoom: 2 };
    } else if (l.id === 'boundary_2') {
      paint['line-color'] = SLATE.country;
      paint['line-opacity'] = 1;
      paint['line-width'] = ['interpolate', ['linear'], ['zoom'], 3, 1.2, 8, 2.2];
    } else if (l.id === 'label_state') paint['text-color'] = SLATE.stateLabel;
    return { ...l, ...extra, paint };
  });
  return { ...style, layers };
}

// Terrain style: already legible on imagery, so only split. Each half keeps
// only the sources it draws, so the county file and imagery load once.
function splitPlain(style) {
  const half = (layers) => ({
    ...style,
    sources: Object.fromEntries(Object.entries(style.sources).filter(([id]) => layers.some((l) => l.source === id))),
    layers,
  });
  return { below: half(style.layers.filter((l) => !isOverlayLayer(l))), above: half(style.layers.filter(isOverlayLayer)) };
}

function splitStyle(style) {
  const below = { ...style, layers: style.layers.filter((l) => !isOverlayLayer(l)) };
  const above = { ...style, layers: style.layers.filter(isOverlayLayer).map(legiblePlaceName) };
  return { below, above };
}

// split=false draws the whole style in one layer (labels under the radar). Used
// in multi-panel views to halve the number of WebGL contexts per panel.
// theme: 'dark' (default), 'light' (OpenFreeMap Positron, recolored: see slateStyle)
// or 'terrain' (satellite imagery with counties and highways: see radar/terrainStyle).
export default function VectorBasemap({ labelsPane, onError, split = true, theme = 'dark' }) {
  const map = useMap();

  useEffect(() => {
    let cancelled = false;
    const layers = [];
    map.attributionControl?.addAttribution(OPENFREEMAP_ATTRIBUTION);
    if (theme === 'terrain') map.attributionControl?.addAttribution(USGS_ATTRIBUTION);
    if (theme === 'night') map.attributionControl?.addAttribution(NASA_ATTRIBUTION);

    (async () => {
      try {
        const [{ maplibreGL }, maplibre, { default: workerUrl }, style] = await Promise.all([
          import('@maplibre/maplibre-gl-leaflet'),
          import('maplibre-gl'),
          import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'),
          fetch(STYLE_URLS[theme] || STYLE_URLS.dark).then((r) => {
            if (!r.ok) throw new Error(`Basemap style returned ${r.status}`);
            return r.json();
          }),
          import('maplibre-gl/dist/maplibre-gl.css'),
        ]);
        if (cancelled) return;
        maplibre.setWorkerUrl(workerUrl);

        const styled =
          theme === 'light'
            ? slateStyle(style)
            : theme === 'terrain'
              ? terrainStyle(style, `${window.location.origin}/data/county-lines.json`)
              : theme === 'night'
                ? nightStyle(style)
                : style;
        const { below, above } = theme === 'terrain' ? splitPlain(styled) : splitStyle(styled);
        const common = { interactive: false, attributionControl: false };
        if (split) {
          layers.push(maplibreGL({ ...common, style: below, pane: 'tilePane' }).addTo(map));
          layers.push(maplibreGL({ ...common, style: above, pane: labelsPane }).addTo(map));
        } else {
          const whole = theme === 'dark' || theme === 'night' ? { ...styled, layers: styled.layers.map(legiblePlaceName) } : styled;
          layers.push(maplibreGL({ ...common, style: whole, pane: 'tilePane' }).addTo(map));
        }
        if (theme === 'terrain') {
          for (const l of layers) {
            const m = l.getMaplibreMap?.();
            if (!m) continue;
            // Add the shields up front (tiles near the center are laid out
            // before a missing-image request would be answered), and on request.
            const addAll = () => [1, 2, 3].forEach((d) => addInterstateShield(m, SHIELD_PREFIX + d));
            m.on('styleimagemissing', (e) => addInterstateShield(m, e.id));
            if (m.isStyleLoaded()) addAll();
            else m.once('styledata', addAll);
          }
          // County lines are on the last layer (the labels layer, or the only one).
          const top = layers[layers.length - 1].getMaplibreMap?.();
          if (top) attachCountyDetail(top, window.location.origin);
        }
        map._wsBasemaps = layers; // read by the post maker's snapshot
        map._wsTerrain = theme === 'terrain'; // its credit line names USGS
        map._wsNight = theme === 'night'; // its credit line names NASA
      } catch (err) {
        // The radar still works without a basemap; just report it.
        if (!cancelled) onError?.(err);
      }
    })();

    return () => {
      cancelled = true;
      delete map._wsBasemaps;
      delete map._wsTerrain;
      delete map._wsNight;
      layers.forEach((l) => map.removeLayer(l));
      map.attributionControl?.removeAttribution(OPENFREEMAP_ATTRIBUTION);
      map.attributionControl?.removeAttribution(USGS_ATTRIBUTION);
      map.attributionControl?.removeAttribution(NASA_ATTRIBUTION);
    };
  }, [map, labelsPane, split, theme]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
