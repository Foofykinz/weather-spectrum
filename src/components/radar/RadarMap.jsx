import React, { useEffect, useRef } from 'react';
import { MapContainer, CircleMarker, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { STATIONS } from '../../radar/stations';
import VectorBasemap from './VectorBasemap';
import StormsLayer from './StormsLayer';
import { GLRadarLayer, glRadarSupported } from '../../radar/gl/GLRadarLayer';
import GlmLayer from './GlmLayer';
import WarningsLayer from './WarningsLayer';
import { warningsAt, watchesAtPoint } from '../../radar/providers/warnings';
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
// Map tiles with weak returns hidden: pixels whose color is one of
// spec.hideColors (exact palette colors, as 0xRRGGBB) become transparent.
// Values are never changed, only left out.
const FilteredTiles = L.TileLayer.extend({
  createTile(coords, done) {
    const size = this.getTileSize();
    const canvas = document.createElement('canvas');
    canvas.width = size.x;
    canvas.height = size.y;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, size.x, size.y);
      try {
        const d = ctx.getImageData(0, 0, size.x, size.y);
        const px = d.data;
        const hide = this.options.hideColors;
        for (let i = 0; i < px.length; i += 4) {
          if (px[i + 3] && hide.has((px[i] << 16) | (px[i + 1] << 8) | px[i + 2])) px[i + 3] = 0;
        }
        ctx.putImageData(d, 0, 0);
      } catch {
        // can't read the pixels: show the tile unfiltered
      }
      done(null, canvas);
    };
    img.onerror = (e) => done(e, canvas);
    img.src = this.getTileUrl(coords);
    return canvas;
  },
});

function createRadarLayer(spec, { opacity, maxNativeZoom, attribution }) {
  // Decoded scans are drawn by the graphics chip when the browser supports it.
  if (spec.kind === 'canvas' && spec.radial && glRadarSupported()) {
    return new GLRadarLayer([spec.radial], { pane: 'radar', opacity, attribution });
  }
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
  if (spec.hideColors) return new FilteredTiles(spec.url, { ...common, maxNativeZoom, hideColors: spec.hideColors });
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
    // The GPU layer is sharp at every zoom by itself; the CPU image needs help.
    sharp.current = spec.kind === 'canvas' && spec.radial && !(layer instanceof GLRadarLayer) ? attachSharpZoom(map, layer, spec, () => opacityRef.current) : null;
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
// holdUntilLoaded: never show a frame that is still loading (after the map
// moves, or a new loop arrives); the last whole frame stays up instead, and
// onShown(i) reports which frame is really on screen. A new loop reuses the
// frames it shares with the old one (same image address), so a refresh only
// downloads the new scan.
function AnimationLayers({ specs, index, opacity, maxNativeZoom, attribution, onLoaded, holdUntilLoaded, onShown }) {
  const map = useMap();
  const layers = useRef([]);
  const loadedCb = useRef(onLoaded);
  loadedCb.current = onLoaded;
  const shownCb = useRef(onShown);
  shownCb.current = onShown;
  const shown = useRef(null); // the layer on screen (hold mode)
  const stale = useRef(null); // the previous loop's last shown layer, until a new one is up
  const pool = useRef(new Map()); // hold mode: the previous loop's layers, by image address
  const want = useRef(index);
  want.current = index;
  const opacityRef = useRef(opacity);
  opacityRef.current = opacity;
  // Hold mode: show the wanted frame if it's whole, else keep the current one.
  const showWanted = () => {
    const l = layers.current[want.current];
    if (!l || l.isLoading()) return;
    layers.current.forEach((x) => x !== l && x.setOpacity(0));
    l.setOpacity(opacityRef.current);
    shown.current = l;
    if (stale.current) {
      map.removeLayer(stale.current);
      stale.current = null;
    }
    shownCb.current?.(want.current);
  };

  const gpu = useRef(null); // one GPU layer holding every decoded frame
  useEffect(() => {
    if (specs.every((s) => s.kind === 'canvas' && s.radial) && glRadarSupported()) {
      const l = new GLRadarLayer(specs.map((s) => s.radial), { pane: 'radar', opacity, attribution });
      l.once('load', () => loadedCb.current?.(specs.length));
      gpu.current = l.addTo(map);
      return () => {
        map.removeLayer(l);
        gpu.current = null;
      };
    }
    let loaded = 0;
    const old = pool.current;
    pool.current = new Map();
    layers.current = specs.map((spec) => {
      const key = holdUntilLoaded && spec.kind === 'xyz' ? spec.url : null;
      const reuse = key && old.get(key);
      if (reuse) {
        old.delete(key);
        if (!reuse.isLoading()) loadedCb.current?.(++loaded);
        return reuse;
      }
      const l = createRadarLayer(spec, { opacity: 0, maxNativeZoom, attribution });
      l.wsKey = key;
      l.once('load', () => loadedCb.current?.(++loaded));
      if (holdUntilLoaded) {
        l.on('load', () => l === layers.current[want.current] && showWanted());
        // The frame on screen redraws after the map moves: hide it rather
        // than show it square by square, until a whole frame is ready.
        l.on('loading', () => {
          if (l !== shown.current) return;
          l.setOpacity(0);
          shown.current = null;
          shownCb.current?.(null);
        });
      }
      return l.addTo(map);
    });
    // Old frames not in the new loop: the one on screen stays until a new
    // frame is up; the rest go now.
    old.forEach((l) => {
      if (l === shown.current) {
        if (stale.current) map.removeLayer(stale.current);
        stale.current = l;
        shown.current = null;
        l.off('load');
      } else map.removeLayer(l);
    });
    if (holdUntilLoaded) showWanted();
    return () => {
      if (holdUntilLoaded) {
        // Kept for the next loop (removed then if it doesn't use them).
        layers.current.forEach((l) => pool.current.set(l.wsKey || l, l));
      } else layers.current.forEach((l) => map.removeLayer(l));
      layers.current = [];
    };
  }, [specs, map, maxNativeZoom, attribution]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (gpu.current) gpu.current.setIndex(index).setOpacity(opacity);
    else if (holdUntilLoaded) showWanted();
    else layers.current.forEach((l, i) => l.setOpacity(i === index ? opacity : 0));
  }, [index, opacity, specs]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(
    () => () => {
      if (stale.current) map.removeLayer(stale.current);
      pool.current.forEach((l) => map.removeLayer(l));
      pool.current = new Map();
      layers.current.forEach((l) => map.removeLayer(l));
    },
    [map]
  );

  return null;
}

// Tap/click the map to read the exact value of the radar bin underneath
// (only for products that carry real data values).
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmtTime = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
};

const fullText = (text, link) =>
  text
    ? `<details style="margin-top:2px"><summary style="cursor:pointer;color:#fbbf24">Full text</summary><div style="max-height:180px;overflow:auto;white-space:pre-wrap;font-size:11px;color:#cbd5e1;margin-top:4px">${esc(text)}</div></details>`
    : link
      ? `<a href="${esc(link)}" target="_blank" rel="noopener" style="color:#fbbf24">Full text (IEM archive)</a>`
      : '';

// Warning details exactly as the NWS issued them (tags from the warning text).
function warningHtml(w) {
  const tags = [];
  if (w.danger === 'emergency') tags.push(w.type.phen === 'FF' ? 'FLASH FLOOD EMERGENCY' : 'TORNADO EMERGENCY');
  if (w.tornadoThreat && w.tornadoThreat !== 'CATASTROPHIC') tags.push(`Tornado damage threat: ${w.tornadoThreat}`);
  if (w.tornado) tags.push(`Tornado: ${w.tornado}`);
  if (w.stormThreat) tags.push(`Damage threat: ${w.stormThreat}`);
  if (w.floodThreat && w.floodThreat !== 'CATASTROPHIC') tags.push(`Flash flood damage threat: ${w.floodThreat}`);
  if (w.hail) tags.push(`Max hail: ${w.hail}`);
  if (w.wind) tags.push(`Max wind: ${w.wind}`);
  return `<div style="border-left:3px solid ${w.type.color};padding-left:6px;margin-bottom:6px">`
    + `<b>${esc(w.type.event)}</b> until ${esc(fmtTime(w.ends))}`
    + (tags.length ? `<br>${tags.map((t) => (/EMERGENCY/.test(t) ? `<b style="color:#f87171">${esc(t)}</b>` : esc(t))).join('<br>')}` : '')
    + `<br><span style="color:#94a3b8">${esc(w.office)}. Issued ${esc(fmtTime(w.sent))}</span>`
    + fullText(w.text, w.link)
    + '</div>';
}

function watchHtml(w) {
  return `<div style="border-left:3px solid ${w.type.color};padding-left:6px;margin-bottom:6px">`
    + `<b>${esc(w.type.event)} ${w.number || ''}</b> until ${esc(fmtTime(w.ends))}`
    + `<br><span style="color:#94a3b8">${esc(w.office)}</span>`
    + fullText(w.text)
    + '</div>';
}

function ValueProbe({ product, details }) {
  const map = useMap();
  useMapEvents({
    click(e) {
      const ws = map._wsWarnings || {};
      const warns = warningsAt(ws.warnings || [], e.latlng.lat, e.latlng.lng);
      const watches = watchesAtPoint(ws.watches || [], ws.shapes, e.latlng.lat, e.latlng.lng);
      const r = product.probe && details ? product.probe(details, e.latlng.lat, e.latlng.lng) : null;
      if (!r && !warns.length && !watches.length) return;
      const n = warns.length + watches.length;
      let html = (n > 1 ? `<div style="color:#94a3b8;font-size:11px;margin-bottom:4px">${n} alerts at this spot, most urgent first</div>` : '')
        + warns.map(warningHtml).join('') + watches.map(watchHtml).join('');
      if (r) {
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
        html += `${main}<br><span style="color:#94a3b8">${where}${beam}</span>`;
      }
      L.popup({ className: 'ws-radar-popup', maxWidth: 280, maxHeight: 280, autoPan: true, autoPanPadding: [12, 64] })
        .setLatLng(e.latlng)
        .setContent(html)
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
  warnings = false,
  warningsFrame, // undefined = live; loop frame state otherwise
  onWarningsStatus,
  animation, // { specs, index, onLoaded } while a loop is playing
  syncGroup, // shared view group for multi-panel layouts
  primary = true, // the one panel that owns zoom buttons, fly-to and saved view
  splitBasemap = true,
  embed = false, // inside a page: no scroll-wheel zoom; touch devices use the zoom buttons
  keepInitialView = false,
  mapRef, // gets the Leaflet map (used by the post maker)
  storms = false,
  stormsTime, // undefined = live; a Date = the storms at that frame
  stormsRadar = null, // only this radar's detections (single-radar view)
  stormsTimes, // all loop frame times, preloaded
  overlay, // GeoJSON features with their own fill/stroke colors (e.g. SPC outlooks)
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
      {mapRef && <MapHandle mapRef={mapRef} />}
      <VectorBasemap labelsPane="labels" onError={onBasemapError} split={splitBasemap} />
      {animation && (
        <AnimationLayers
          specs={animation.specs}
          index={animation.index}
          opacity={opacity}
          maxNativeZoom={product.maxNativeZoom}
          attribution={product.attribution}
          onLoaded={animation.onLoaded}
          holdUntilLoaded={animation.holdUntilLoaded}
          onShown={animation.onShown}
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
      {warnings && <WarningsLayer frame={warningsFrame} onStatus={onWarningsStatus} />}
      {storms && <StormsLayer time={stormsTime} times={stormsTimes} radar={stormsRadar} />}
      {overlay?.length > 0 && <GeoOverlay features={overlay} />}
      <MapSync group={syncGroup} />
      <AutoResize />
      {primary && <ViewWatcher onViewChange={onViewChange} />}
      {primary && <ZoomButtons />}
    </MapContainer>
  );
}

// Filled shapes from GeoJSON features that carry their own colors
// (properties.fill / properties.stroke), e.g. SPC outlook areas. Drawn above
// the radar and below warnings; not clickable.
function GeoOverlay({ features }) {
  const map = useMap();
  useEffect(() => {
    if (!map.getPane('outlook')) {
      const pane = map.createPane('outlook');
      pane.style.zIndex = '420';
      pane.style.pointerEvents = 'none';
    }
    const renderer = L.svg({ pane: 'outlook' });
    const layer = L.geoJSON(
      { type: 'FeatureCollection', features },
      {
        pane: 'outlook',
        renderer,
        interactive: false,
        style: (f) => ({ color: f.properties.stroke || '#ffffff', weight: 2, opacity: 0.95, fillColor: f.properties.fill || '#888888', fillOpacity: 0.5 }),
      }
    ).addTo(map);
    return () => {
      layer.remove();
      renderer.remove();
    };
  }, [map, features]);
  return null;
}

function MapHandle({ mapRef }) {
  const map = useMap();
  useEffect(() => {
    mapRef.current = map;
    return () => {
      if (mapRef.current === map) mapRef.current = null;
    };
  }, [map, mapRef]);
  return null;
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
