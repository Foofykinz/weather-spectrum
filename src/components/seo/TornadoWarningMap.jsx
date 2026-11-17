import React, { useEffect, useRef } from 'react';
import { MapContainer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import VectorBasemap from '../radar/VectorBasemap';

// Map of a period's tornado warnings: every polygon as first issued. Click
// one for its details. `focus` (a warning key) opens that warning's popup.
const US = { center: [38.5, -96.5], zoom: 4 };

function Polygons({ warnings, popupHtml, focus, fit }) {
  const map = useMap();
  const byKey = useRef(new Map());
  useEffect(() => {
    if (!map.getPane('warnings')) map.createPane('warnings').style.zIndex = '430';
    const renderer = L.canvas({ pane: 'warnings', padding: 0.3, tolerance: 3 });
    const group = L.featureGroup().addTo(map);
    byKey.current = new Map();
    // Oldest first so the newest warnings are drawn on top.
    for (const w of [...warnings].reverse()) {
      const layer = L.geoJSON(w.geometry, {
        pane: 'warnings',
        renderer,
        style: { color: '#ef4444', weight: 1, opacity: 0.9, fillColor: '#ef4444', fillOpacity: 0.22 },
      });
      layer.bindPopup(() => popupHtml(w), { maxWidth: 280 });
      layer.addTo(group);
      byKey.current.set(w.key, layer);
    }
    if (fit && warnings.length) map.fitBounds(group.getBounds(), { padding: [20, 20], maxZoom: 8 });
    else if (fit) map.setView(US.center, US.zoom);
    return () => {
      group.remove();
      renderer.remove();
    };
  }, [map, warnings, popupHtml, fit]);
  useEffect(() => {
    const layer = focus && byKey.current.get(focus);
    if (!layer) return;
    map.flyToBounds(layer.getBounds(), { maxZoom: 9, duration: 0.6 });
    layer.openPopup(layer.getBounds().getCenter());
  }, [map, focus, warnings]);
  return null;
}

export default function TornadoWarningMap({ warnings, popupHtml, focus, fit }) {
  return (
    <MapContainer
      center={US.center}
      zoom={US.zoom}
      minZoom={3}
      maxZoom={11}
      scrollWheelZoom={false}
      worldCopyJump
      className="h-full w-full bg-[#0b0f17]"
    >
      <VectorBasemap split={false} />
      <Polygons warnings={warnings} popupHtml={popupHtml} focus={focus} fit={fit} />
    </MapContainer>
  );
}
