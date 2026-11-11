import React, { useEffect, useRef } from 'react';
import { MapContainer, CircleMarker, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { STATIONS } from '../../radar/stations';
import VectorBasemap from './VectorBasemap';

// Map layer stacking (bottom to top):
//   dark basemap  ->  radar  ->  borders & place names  ->  station markers
// Labels sit above the radar so towns stay readable inside heavy precipitation.
const PANES = { radar: 350, labels: 450 };


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
// Build a Leaflet layer from a product's layer description:
//   { kind: 'xyz', url }          ready-made map tiles (e.g. IEM)
//   { kind: 'wms', url, params }  map images rendered on request (e.g. NWS)
//   { kind: 'canvas', canvas, bounds }  an image we drew ourselves (Level III),
//                                       already in the map's projection
function createRadarLayer(spec, { opacity, maxNativeZoom, attribution }) {
  if (spec.kind === 'canvas') {
    // Leaflet's element overlay positions any element (here a <canvas>) over
    // its bounds. "crisp" CSS turns off browser smoothing, so zooming in
    // shows the true range bins instead of blurring them together.
    return L.svgOverlay(spec.canvas, L.latLngBounds(spec.bounds), {
      pane: 'radar',
      opacity,
      attribution,
      interactive: false,
      className: 'ws-radar-crisp',
    });
  }
  const common = {
    pane: 'radar',
    opacity,
    maxZoom: 18,
    attribution,
    // Fewer requests on mobile: don't load tiles mid-pan, keep a small buffer.
    updateWhenIdle: true,
    keepBuffer: 1,
    crossOrigin: true,
    // Skip requests outside the product's coverage area.
    ...(spec.bounds ? { bounds: L.latLngBounds(spec.bounds) } : {}),
  };
  if (spec.kind === 'wms') {
    // 512px images: a quarter as many requests as 256px tiles, same sharpness,
    // because the server renders each image fresh for exactly this area.
    return L.tileLayer.wms(spec.url, { ...common, ...spec.params, tileSize: 512 });
  }
  return L.tileLayer(spec.url, { ...common, maxNativeZoom });
}

function RadarTiles({ spec, opacity, maxNativeZoom, attribution, onTileErrors }) {
  const map = useMap();
  const current = useRef(null);
  const errorCb = useRef(onTileErrors);
  errorCb.current = onTileErrors;

  useEffect(() => {
    if (!spec) return undefined;
    let errors = 0;
    const layer = createRadarLayer(spec, { opacity, maxNativeZoom, attribution });
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
    // A drawn canvas is ready immediately — there's nothing to wait for.
    if (spec.kind === 'canvas' && previous && map.hasLayer(previous)) map.removeLayer(previous);

    // Safety net: never leave an old scan on screen for long if the new one is slow.
    const t = setTimeout(() => {
      if (previous && map.hasLayer(previous)) map.removeLayer(previous);
    }, 8000);

    return () => clearTimeout(t);
  }, [spec, map, maxNativeZoom, attribution]); // eslint-disable-line react-hooks/exhaustive-deps

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

// Tap/click the map to read the exact value of the radar bin underneath
// (only for products that carry real data values).
function ValueProbe({ product, details }) {
  const map = useMap();
  useMapEvents({
    click(e) {
      if (!product.probe || !details) return;
      const r = product.probe(details, e.latlng.lat, e.latlng.lng);
      if (!r) return;
      const kft = (km) => (km * 3.28084).toFixed(1);
      const where = `${r.groundKm.toFixed(1)} km at ${r.azimuth.toFixed(0)}° from radar`;
      let main;
      if (r.status === 'value') main = `<b>${product.short.replace('Site ', '')} ${product.probeFormat(r.value)}</b>`;
      else if (r.status === 'below-threshold') main = 'No data (below signal threshold)';
      else if (r.status === 'range-folded') main = 'Range folded (no reliable value)';
      else main = 'Outside radar coverage';
      const beam = r.status === 'out-of-range' ? '' : `<br>${r.elevation}° beam ≈ ${kft(r.beamKm)} kft above radar`;
      L.popup({ className: 'ws-radar-popup', autoPan: false })
        .setLatLng(e.latlng)
        .setContent(`${main}<br><span style="color:#94a3b8">${where}${beam}</span>`)
        .openOn(map);
    },
  });
  // Close any open readout when the product or scan changes.
  useEffect(() => () => map.closePopup(), [map, product, details]);
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

// Clicking a radar dot stops the click from reaching the map, so it selects the
// radar without also opening a value readout underneath.
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
        eventHandlers={{ click: (e) => { L.DomEvent.stopPropagation(e); onSelect(s.id); } }}
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
  layer,
  opacity,
  initialView,
  onViewChange,
  showStations,
  station,
  onSelectStation,
  onTileErrors,
  onBasemapError,
  details,
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
      <VectorBasemap labelsPane="labels" onError={onBasemapError} />
      {layer && (
        <RadarTiles
          spec={layer}
          opacity={opacity}
          maxNativeZoom={product.maxNativeZoom}
          attribution={product.attribution}
          onTileErrors={onTileErrors}
        />
      )}
      {showStations && <StationMarkers selectedId={station?.id} onSelect={onSelectStation} />}
      {showStations && <FlyToStation station={station} />}
      <ValueProbe product={product} details={layer ? details : null} />
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
