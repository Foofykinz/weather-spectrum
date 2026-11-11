import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { STATIONS } from '../../radar/stations';

// Map layer stacking (bottom to top):
//   dark basemap  ->  radar  ->  place names & roads labels  ->  station markers
// Labels sit above the radar so towns stay readable inside heavy precipitation.
const PANES = { radar: 350, labels: 450 };

// Basemap: Esri "Dark Gray Canvas" (no API key required). The labels come as a
// separate transparent layer, which lets us draw them above the radar.
// Note: review Esri's terms before commercial launch; a self-hosted basemap
// (e.g. Protomaps on Cloudflare R2) is the long-term, zero-licensing option.
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas';
const BASEMAP_ATTRIBUTION = 'Basemap &copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors';

function Panes() {
  const map = useMap();
  // Create custom panes synchronously so layers below can use them on first render.
  for (const [name, z] of Object.entries(PANES)) {
    if (!map.getPane(name)) {
      const pane = map.createPane(name);
      pane.style.zIndex = String(z);
      pane.style.pointerEvents = 'none';
    }
  }
  return null;
}

// Radar imagery layer. When a new scan arrives, the new tiles load on top of
// the old ones and the old layer is removed only once the new one is ready,
// so the radar never blinks out while updating.
function RadarTiles({ url, opacity, maxNativeZoom, attribution, onTileErrors }) {
  const map = useMap();
  const current = useRef(null);
  const errorCb = useRef(onTileErrors);
  errorCb.current = onTileErrors;

  useEffect(() => {
    if (!url) return undefined;
    let errors = 0;
    const layer = L.tileLayer(url, {
      pane: 'radar',
      opacity,
      maxNativeZoom,
      maxZoom: 18,
      attribution,
      // Fewer requests on mobile: don't load tiles mid-pan, keep a small buffer.
      updateWhenIdle: true,
      keepBuffer: 1,
      crossOrigin: true,
    });
    const previous = current.current;
    current.current = layer;
    errorCb.current?.(0);

    layer.on('tileerror', () => {
      errors += 1;
      errorCb.current?.(errors);
    });
    layer.once('load', () => {
      if (previous && map.hasLayer(previous)) map.removeLayer(previous);
    });
    layer.addTo(map);

    // Safety net: never leave an old scan on screen for long if the new one is slow.
    const t = setTimeout(() => {
      if (previous && map.hasLayer(previous)) map.removeLayer(previous);
    }, 8000);

    return () => clearTimeout(t);
  }, [url, map, maxNativeZoom, attribution]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    current.current?.setOpacity(opacity);
  }, [opacity]);

  // Remove all radar imagery when this component goes away (e.g. product
  // switched and the new one hasn't loaded) so we never show the wrong product.
  useEffect(
    () => () => {
      map.eachLayer((l) => {
        if (l.options?.pane === 'radar') map.removeLayer(l);
      });
      current.current = null;
    },
    [map]
  );

  return null;
}

function ViewWatcher({ onViewChange }) {
  useMapEvents({
    moveend(e) {
      const m = e.target;
      const c = m.getCenter();
      onViewChange?.({ lat: c.lat, lon: c.lng, zoom: m.getZoom() });
    },
  });
  return null;
}

function FlyToStation({ station }) {
  const map = useMap();
  const lastId = useRef(null);
  useEffect(() => {
    if (!station || station.id === lastId.current) return;
    lastId.current = station.id;
    // Move only if the radar is off-center or we're zoomed too far out to see
    // its ~230 km coverage; otherwise leave the user's view alone.
    if (map.getZoom() < 6 || !map.getBounds().pad(-0.25).contains([station.lat, station.lon])) {
      map.flyTo([station.lat, station.lon], Math.max(map.getZoom(), 7), { duration: 0.8 });
    }
  }, [station, map]);
  return null;
}

function StationMarkers({ selectedId, onSelect }) {
  return STATIONS.map((s) => {
    const selected = s.id === selectedId;
    return (
      <CircleMarker
        key={s.id}
        center={[s.lat, s.lon]}
        radius={selected ? 7 : 5}
        pathOptions={{
          color: selected ? '#fbbf24' : '#e2e8f0',
          weight: selected ? 3 : 1.5,
          fillColor: selected ? '#f59e0b' : '#334155',
          fillOpacity: 0.9,
        }}
        eventHandlers={{ click: () => onSelect(s.id) }}
      >
        <Tooltip direction="top" offset={[0, -6]}>
          <span className="font-semibold">{s.icao}</span> · {s.name}, {s.state}
        </Tooltip>
      </CircleMarker>
    );
  });
}

export default function RadarMap({
  product,
  tileUrl,
  opacity,
  initialView,
  onViewChange,
  showStations,
  station,
  onSelectStation,
  onTileErrors,
}) {
  return (
    <MapContainer
      center={[initialView.lat, initialView.lon]}
      zoom={initialView.zoom}
      minZoom={3}
      maxZoom={12}
      zoomControl={false}
      preferCanvas
      worldCopyJump
      className="ws-radar-map h-full w-full bg-[#0b0f17]"
    >
      <Panes />
      <TileLayer
        url={`${ESRI}/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`}
        attribution={BASEMAP_ATTRIBUTION}
        maxNativeZoom={16}
        maxZoom={18}
      />
      <TileLayer
        url={`${ESRI}/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`}
        pane="labels"
        maxNativeZoom={16}
        maxZoom={18}
      />
      {tileUrl && (
        <RadarTiles
          url={tileUrl}
          opacity={opacity}
          maxNativeZoom={product.maxNativeZoom}
          attribution={product.attribution}
          onTileErrors={onTileErrors}
        />
      )}
      {showStations && <StationMarkers selectedId={station?.id} onSelect={onSelectStation} />}
      {showStations && <FlyToStation station={station} />}
      <ViewWatcher onViewChange={onViewChange} />
      <ZoomButtons />
    </MapContainer>
  );
}

function ZoomButtons() {
  const map = useMap();
  const ref = useRef(null);
  useEffect(() => {
    // Stop taps on the buttons from also panning/zooming the map underneath.
    if (ref.current) {
      L.DomEvent.disableClickPropagation(ref.current);
      L.DomEvent.disableScrollPropagation(ref.current);
    }
  }, []);
  const btn =
    'w-10 h-10 flex items-center justify-center text-lg text-slate-200 hover:bg-slate-700/80 active:bg-slate-600';
  return (
    <div className="leaflet-bottom leaflet-right" style={{ marginBottom: 28 }}>
      <div ref={ref} className="leaflet-control flex flex-col rounded-lg overflow-hidden border border-slate-700 bg-slate-900/85 backdrop-blur shadow-lg mr-3">
        <button type="button" aria-label="Zoom in" className={btn} onClick={() => map.zoomIn()}>
          +
        </button>
        <div className="h-px bg-slate-700" />
        <button type="button" aria-label="Zoom out" className={btn} onClick={() => map.zoomOut()}>
          −
        </button>
      </div>
    </div>
  );
}
