import React, { useEffect, useRef } from 'react';
import { MapContainer, CircleMarker, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { STATIONS } from '../../radar/stations';
import VectorBasemap from './VectorBasemap';
import GlmLayer from './GlmLayer';
import { renderLevel3View } from '../../radar/providers/level3';

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
    // A decoded scan may be shared by several panels, but one canvas element
    // can only be on the page once: copy it if it's already displayed.
    let canvas = spec.canvas;
    if (canvas.parentNode) {
      const copy = document.createElement('canvas');
      copy.width = canvas.width;
      copy.height = canvas.height;
      copy.getContext('2d').drawImage(canvas, 0, 0);
      canvas = copy;
    }
    spec = { ...spec, canvas };
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

// Sharp zoom for scans we decode ourselves: the overview image of the whole
// scan has a fixed number of pixels, so when zoomed in past that, redraw just
// the area on screen at screen resolution (same exact bins, no stretching).
// The overview is hidden only once the sharp image is ready.
function attachSharpZoom(map, base, spec, getOpacity) {
  const scanBounds = L.latLngBounds(spec.bounds);
  let overlay = null;
  let seq = 0;
  let timer = 0;
  let dead = false;

  const clear = () => {
    seq += 1;
    if (overlay) map.removeLayer(overlay);
    overlay = null;
    base.setOpacity(getOpacity());
  };

  const run = async () => {
    if (dead) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const a = map.latLngToContainerPoint(scanBounds.getNorthWest());
    const b = map.latLngToContainerPoint(scanBounds.getSouthEast());
    if (((b.x - a.x) * dpr) / spec.canvas.width <= 1.2) return clear(); // overview is sharp enough
    const view = map.getBounds().pad(0.25);
    const s = Math.max(view.getSouth(), scanBounds.getSouth());
    const n = Math.min(view.getNorth(), scanBounds.getNorth());
    const w = Math.max(view.getWest(), scanBounds.getWest());
    const e = Math.min(view.getEast(), scanBounds.getEast());
    if (s >= n || w >= e) return clear(); // radar out of view
    const box = L.latLngBounds([s, w], [n, e]);
    const p1 = map.latLngToContainerPoint(box.getNorthWest());
    const p2 = map.latLngToContainerPoint(box.getSouthEast());
    let width = Math.max(1, Math.round((p2.x - p1.x) * dpr));
    let height = Math.max(1, Math.round((p2.y - p1.y) * dpr));
    const limit = 6e6 / (width * height); // keep memory and draw time bounded
    if (limit < 1) {
      width = Math.floor(width * Math.sqrt(limit));
      height = Math.floor(height * Math.sqrt(limit));
    }
    const mine = ++seq;
    let img;
    try {
      img = await renderLevel3View(spec.radial, [[s, w], [n, e]], width, height);
    } catch {
      return; // keep showing the overview
    }
    if (dead || mine !== seq) return;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').putImageData(new ImageData(img.rgba, width, height), 0, 0);
    const next = L.svgOverlay(canvas, box, { pane: 'radar', opacity: getOpacity(), interactive: false });
    next.addTo(map);
    if (overlay) map.removeLayer(overlay);
    overlay = next;
    base.setOpacity(0);
  };

  const update = () => {
    clearTimeout(timer);
    timer = setTimeout(run, 80);
  };
  map.on('moveend zoomend resize', update);
  update();

  return {
    setOpacity(o) {
      if (overlay) overlay.setOpacity(o);
      else base.setOpacity(o);
    },
    detach() {
      dead = true;
      clearTimeout(timer);
      map.off('moveend zoomend resize', update);
      if (overlay) map.removeLayer(overlay);
      overlay = null;
      base.setOpacity(getOpacity());
    },
  };
}

function RadarTiles({ spec, opacity, maxNativeZoom, attribution, onTileErrors }) {
  const map = useMap();
  const current = useRef(null);
  const sharp = useRef(null);
  const opacityRef = useRef(opacity);
  opacityRef.current = opacity;
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
    sharp.current = spec.kind === 'canvas' && spec.radial ? attachSharpZoom(map, layer, spec, () => opacityRef.current) : null;
    const sharpNow = sharp.current;

    // Safety net: never leave an old scan on screen for long if the new one is slow.
    const t = setTimeout(() => {
      if (previous && map.hasLayer(previous)) map.removeLayer(previous);
    }, 8000);

    return () => {
      clearTimeout(t);
      sharpNow?.detach();
    };
  }, [spec, map, maxNativeZoom, attribution]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (sharp.current) sharp.current.setOpacity(opacity);
    else current.current?.setOpacity(opacity);
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

// Radar loop: one layer per frame, all added at once (hidden) so their images
// download in the background; playback only changes which one is visible.
function AnimationLayers({ specs, index, opacity, maxNativeZoom, attribution, onLoaded }) {
  const map = useMap();
  const layers = useRef([]);
  const loadedCb = useRef(onLoaded);
  loadedCb.current = onLoaded;

  useEffect(() => {
    let loaded = 0;
    layers.current = specs.map((spec) => {
      const l = createRadarLayer(spec, { opacity: 0, maxNativeZoom, attribution });
      l.once('load', () => loadedCb.current?.(++loaded));
      return l.addTo(map);
    });
    return () => {
      layers.current.forEach((l) => map.removeLayer(l));
      layers.current = [];
    };
  }, [specs, map, maxNativeZoom, attribution]);

  useEffect(() => {
    layers.current.forEach((l, i) => l.setOpacity(i === index ? opacity : 0));
  }, [index, opacity, specs]);

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
      if (r.status === 'value') {
        main = `<b>${product.probeFormat(r.value)}</b>`;
        if (r.topped) main += '<br>Topped: echo continues above the highest scanned tilt, so the true top may be higher';
      } else if (r.status === 'below-threshold') main = 'No data (below signal threshold)';
      else if (r.status === 'range-folded') main = 'Range folded (no reliable value)';
      else if (r.status === 'no-data') main = 'No data (flagged by the radar)';
      else main = 'Outside radar coverage';
      // Volume products (elevation 0 in the file) combine all tilts, so there is no single beam height.
      const beam = r.status === 'out-of-range' || !r.elevation ? '' : `<br>${r.elevation}° beam ≈ ${kft(r.beamKm)} kft above radar`;
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

// Keeps several maps showing the same place. Each map in a group copies its
// view to the others while it moves; the shared "syncing" flag stops the
// copies from echoing back (no synchronization loops).
function MapSync({ group }) {
  const map = useMap();
  useEffect(() => {
    if (!group) return undefined;
    group.maps.add(map);
    const push = () => {
      if (group.syncing) return;
      group.syncing = true;
      for (const other of group.maps) {
        if (other !== map) other.setView(map.getCenter(), map.getZoom(), { animate: false });
      }
      group.syncing = false;
    };
    map.on('move zoomend', push);
    return () => {
      map.off('move zoomend', push);
      group.maps.delete(map);
    };
  }, [group, map]);
  return null;
}

function ViewWatcher({ onViewChange }) {
  const report = (m) => {
    const c = m.getCenter();
    onViewChange?.({ lat: c.lat, lon: c.lng, zoom: m.getZoom() });
  };
  const map = useMapEvents({
    moveend(e) {
      report(e.target);
    },
  });
  // Also record the opening position (e.g. from a link), not only later moves.
  useEffect(() => {
    report(map);
  }, [map]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

// keepInitialView: the page opened with an explicit position (e.g. from a
// city page link), so don't fly away from it for the initially selected radar.
function FlyToStation({ station, keepInitialView }) {
  const map = useMap();
  const lastId = useRef(keepInitialView ? station?.id : null);
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
  lightning,
  onLightningStatus,
  animation, // { specs, index, onLoaded } while a loop is playing
  syncGroup, // shared view group for multi-panel layouts
  primary = true, // the one panel that owns zoom buttons, fly-to and saved view
  splitBasemap = true,
  embed = false, // inside a page: no scroll-wheel zoom; touch devices use the zoom buttons
  keepInitialView = false,
}) {
  return (
    <MapContainer
      center={[initialView.lat, initialView.lon]}
      zoom={initialView.zoom}
      minZoom={3}
      maxZoom={12}
      zoomControl={false}
      scrollWheelZoom={!embed}
      dragging={!(embed && L.Browser.mobile)}
      preferCanvas
      worldCopyJump
      className="ws-radar-map h-full w-full bg-[#0b0f17]"
    >
      <Panes />
      <VectorBasemap labelsPane="labels" onError={onBasemapError} split={splitBasemap} />
      {animation && (
        <AnimationLayers
          specs={animation.specs}
          index={animation.index}
          opacity={opacity}
          maxNativeZoom={product.maxNativeZoom}
          attribution={product.attribution}
          onLoaded={animation.onLoaded}
        />
      )}
      {layer && !animation && (
        <RadarTiles
          spec={layer}
          opacity={opacity}
          maxNativeZoom={product.maxNativeZoom}
          attribution={product.attribution}
          onTileErrors={onTileErrors}
        />
      )}
      {showStations && <StationMarkers selectedId={station?.id} onSelect={onSelectStation} />}
      {showStations && primary && <FlyToStation station={station} keepInitialView={keepInitialView} />}
      <ValueProbe product={product} details={layer ? details : null} />
      {lightning && <GlmLayer onStatus={onLightningStatus} />}
      <MapSync group={syncGroup} />
      <AutoResize />
      {primary && <ViewWatcher onViewChange={onViewChange} />}
      {primary && <ZoomButtons />}
    </MapContainer>
  );
}

// Leaflet only notices window resizes. Panels also change size when the loop
// or lightning strip appears, so watch the container itself (keeps the center).
function AutoResize() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    let frame = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => map.invalidateSize());
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [map]);
  return null;
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
