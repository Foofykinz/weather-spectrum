import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

// Dark basemap from OpenFreeMap (https://openfreemap.org/): free, no API key,
// commercial use allowed, attribution required.
//
// OpenFreeMap serves *vector* map data, which Leaflet can't draw on its own,
// so MapLibre GL renders it inside the Leaflet map. MapLibre is large, so it's
// loaded only when the radar page opens — the rest of the site stays light.
//
// The style is split into two layers so the radar sits in between:
//   below radar: land, water, roads           (Leaflet "tilePane")
//   above radar: borders + place names        (our "labels" pane)
// That keeps towns and state lines readable inside heavy precipitation.

const STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';

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

function splitStyle(style) {
  const below = { ...style, layers: style.layers.filter((l) => !isOverlayLayer(l)) };
  const above = { ...style, layers: style.layers.filter(isOverlayLayer).map(legiblePlaceName) };
  return { below, above };
}

export default function VectorBasemap({ labelsPane, onError }) {
  const map = useMap();

  useEffect(() => {
    let cancelled = false;
    const layers = [];
    map.attributionControl?.addAttribution(OPENFREEMAP_ATTRIBUTION);

    (async () => {
      try {
        const [{ maplibreGL }, maplibre, { default: workerUrl }, style] = await Promise.all([
          import('@maplibre/maplibre-gl-leaflet'),
          import('maplibre-gl'),
          import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'),
          fetch(STYLE_URL).then((r) => {
            if (!r.ok) throw new Error(`Basemap style returned ${r.status}`);
            return r.json();
          }),
          import('maplibre-gl/dist/maplibre-gl.css'),
        ]);
        if (cancelled) return;
        maplibre.setWorkerUrl(workerUrl);

        const { below, above } = splitStyle(style);
        const common = { interactive: false, attributionControl: false };
        layers.push(maplibreGL({ ...common, style: below, pane: 'tilePane' }).addTo(map));
        layers.push(maplibreGL({ ...common, style: above, pane: labelsPane }).addTo(map));
      } catch (err) {
        // The radar still works without a basemap; just report it.
        if (!cancelled) onError?.(err);
      }
    })();

    return () => {
      cancelled = true;
      layers.forEach((l) => map.removeLayer(l));
      map.attributionControl?.removeAttribution(OPENFREEMAP_ATTRIBUTION);
    };
  }, [map, labelsPane]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
