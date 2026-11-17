import React, { useEffect, useRef } from 'react';
import { MapContainer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import VectorBasemap from '../radar/VectorBasemap';

// Map of a period's tornado warnings: every polygon as first issued. Click
// one for its details. `focus` (a warning key) opens that warning's popup.
// theme: 'dark' | 'light'. bounds ([[s, w], [n, e]]): fit to this area
// instead (used for the post maker's picture). mapRef gets the Leaflet map.
const US = { center: [38.5, -96.5], zoom: 4 };
export const POLY_STYLE = {
  dark: { color: '#ef4444', weight: 1, opacity: 0.9, fillColor: '#ef4444', fillOpacity: 0.22 },
  light: { color: '#b91c1c', weight: 1, opacity: 0.95, fillColor: '#dc2626', fillOpacity: 0.3 },
};
export const MAP_BG = { dark: '#0b0f17', light: '#cfd5dd' };

function Polygons({ warnings, popupHtml, focus, fit, theme, bounds, frame }) {
  const map = useMap();
  const byKey = useRef(new Map());
  const group = useRef(null);
  useEffect(() => {
    if (!map.getPane('warnings')) map.createPane('warnings').style.zIndex = '430';
    const renderer = L.canvas({ pane: 'warnings', padding: 0.3, tolerance: 3 });
    const g = L.featureGroup().addTo(map);
    group.current = g;
    byKey.current = new Map();
    // Oldest first so the newest warnings are drawn on top.
    for (const w of [...warnings].reverse()) {
      const layer = L.geoJSON(w.geometry, { pane: 'warnings', renderer, style: POLY_STYLE[theme] || POLY_STYLE.dark, interactive: !!popupHtml });
      if (popupHtml) layer.bindPopup(() => popupHtml(w), { maxWidth: 280 });
      layer.addTo(g);
      byKey.current.set(w.key, layer);
    }
    if (bounds && frame) {
      // Fit above the boxes, then slide the warnings up to the top edge.
      map.fitBounds(bounds, { paddingTopLeft: [8, frame.top + 8], paddingBottomRight: [8, frame.bottom + 8], animate: false });
      const north = map.latLngToContainerPoint([bounds[1][0], (bounds[0][1] + bounds[1][1]) / 2]).y;
      if (frame.top || frame.bottom) map.panBy([0, north - (frame.top + 8)], { animate: false });
    } else if (bounds) map.fitBounds(bounds, { padding: [8, 8], animate: false });
    else if (fit && warnings.length) map.fitBounds(g.getBounds(), { padding: [20, 20], maxZoom: 8 });
    else if (fit) map.setView(US.center, US.zoom);
    return () => {
      g.remove();
      renderer.remove();
    };
    // theme is applied below without rebuilding (and without moving the map)
  }, [map, warnings, popupHtml, fit, bounds, frame]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    group.current?.setStyle(POLY_STYLE[theme] || POLY_STYLE.dark);
    map.getContainer().style.background = MAP_BG[theme] || MAP_BG.dark;
  }, [map, theme, warnings]);
  useEffect(() => {
    const layer = focus && byKey.current.get(focus);
    if (!layer) return;
    map.flyToBounds(layer.getBounds(), { maxZoom: 9, duration: 0.6 });
    layer.openPopup(layer.getBounds().getCenter());
  }, [map, focus, warnings]);
  return null;
}

function Handle({ mapRef }) {
  const map = useMap();
  useEffect(() => {
    mapRef.current = map;
    return () => {
      if (mapRef.current === map) mapRef.current = null;
    };
  }, [map, mapRef]);
  return null;
}

export default function TornadoWarningMap({ warnings, popupHtml, focus, fit, theme = 'dark', bounds, frame, mapRef, still = false }) {
  return (
    <MapContainer
      center={US.center}
      zoom={US.zoom}
      minZoom={2}
      maxZoom={11}
      zoomSnap={still ? 0.1 : 1}
      zoomControl={!still}
      attributionControl={!still}
      dragging={!still}
      scrollWheelZoom={false}
      fadeAnimation={!still}
      zoomAnimation={!still}
      worldCopyJump
      className="h-full w-full"
    >
      {mapRef && <Handle mapRef={mapRef} />}
      <VectorBasemap split={false} theme={theme} />
      <Polygons warnings={warnings} popupHtml={popupHtml} focus={focus} fit={fit} theme={theme} bounds={bounds} frame={frame} />
    </MapContainer>
  );
}
