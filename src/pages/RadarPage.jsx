import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Layers, ArrowLeft, Zap, Play } from 'lucide-react';
import LoopControls from '../components/radar/LoopControls';
import RadarMap from '../components/radar/RadarMap';
import RadarLegend from '../components/radar/RadarLegend';
import RadarStatus from '../components/radar/RadarStatus';
import ProductPanel from '../components/radar/ProductPanel';
import TiltSelector from '../components/radar/TiltSelector';
import GlmStatus from '../components/radar/GlmStatus';
import { getProduct, DEFAULT_PRODUCT_ID, LEVEL3_TILTS } from '../radar/products';
import { listLevel3Tilts } from '../radar/providers/level3';
import { getStation, nearestStation } from '../radar/stations';
import { useRadarFrame, useNow } from '../radar/useRadarFrame';

// Per-viewer conveniences only (last map view & opacity). Safe if storage is blocked.
const VIEW_KEY = 'ws.radar.view';
const OPACITY_KEY = 'ws.radar.opacity';
const DEFAULT_VIEW = { lat: 38.5, lon: -96.5, zoom: 4 };

function readStored(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
function writeStored(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable; ignore */
  }
}

export default function RadarPage() {
  // Product and station live in the URL, so a view can be bookmarked or shared:
  //   /radar?product=site-reflectivity&site=TLX
  const [params, setParams] = useSearchParams();
  const product = getProduct(params.get('product') || DEFAULT_PRODUCT_ID);
  const station = getStation((params.get('site') || '').toUpperCase());

  const [initialView] = useState(() => {
    const v = readStored(VIEW_KEY, DEFAULT_VIEW);
    return Number.isFinite(v?.lat) && Number.isFinite(v?.lon) && Number.isFinite(v?.zoom) ? v : DEFAULT_VIEW;
  });
  const viewRef = useRef(initialView);
  const [opacity, setOpacity] = useState(() => {
    const o = Number(readStored(OPACITY_KEY, 0.85));
    return o >= 0.1 && o <= 1 ? o : 0.85;
  });
  const [panelOpen, setPanelOpen] = useState(false);
  const [tileErrors, setTileErrors] = useState(0);
  const [basemapError, setBasemapError] = useState(null);

  // Elevation tilt (Level III products only), also kept in the URL: &tilt=NA
  const tiltParam = params.get('tilt');
  const tilt = product.tiltLetter ? (LEVEL3_TILTS.includes(tiltParam) ? tiltParam : 'N0') : undefined;
  const lightningOn = params.get('ltg') === '1';
  const [lightningStatus, setLightningStatus] = useState(null);

  const frame = useRadarFrame(product, product.scope === 'site' ? station : null, tilt);
  const now = useNow();

  // Which tilts exist right now (and their real angles). Refreshed when a new scan arrives.
  const [tiltInfo, setTiltInfo] = useState({ key: null, tilts: [] });
  const tiltKey = product.tiltLetter && station ? `${station.id}:${product.tiltLetter}` : null;
  const scanTime = frame.validTime?.getTime();
  useEffect(() => {
    if (!tiltKey) return undefined;
    const controller = new AbortController();
    listLevel3Tilts(station, product.tiltLetter, LEVEL3_TILTS, controller.signal)
      .then((tilts) => setTiltInfo({ key: tiltKey, tilts }))
      .catch(() => {}); // the selector simply stays hidden if this fails
    return () => controller.abort();
  }, [tiltKey, scanTime]); // eslint-disable-line react-hooks/exhaustive-deps
  const tilts = tiltInfo.key === tiltKey ? tiltInfo.tilts : [];

  // ---- Radar loop (products with a `frames` list: IEM and NWS imagery).
  const LOOP_FRAMES = 10;
  const FRAME_MS = 600;
  const LAST_FRAME_HOLD = 3; // extra ticks on the newest frame before restarting
  const site = product.scope === 'site' ? station : null;
  const canLoop = !!product.frames && (product.scope !== 'site' || !!station);
  const [anim, setAnim] = useState(null); // { times, specs, index, playing, loaded, hold }
  const [loopError, setLoopError] = useState(null);
  const loopReq = useRef(null);

  const stopLoop = useCallback(() => {
    loopReq.current?.abort();
    setAnim(null);
  }, []);

  const startLoop = async () => {
    loopReq.current?.abort();
    const controller = new AbortController();
    loopReq.current = controller;
    setLoopError(null);
    try {
      const times = await product.frames(site, LOOP_FRAMES, controller.signal);
      if (controller.signal.aborted) return;
      if (times.length < 2) throw new Error('Not enough recent scans to loop.');
      setAnim({ times, specs: times.map((t) => product.layer(site, t)), index: 0, playing: true, loaded: 0, hold: 0 });
    } catch (err) {
      if (err.name !== 'AbortError') setLoopError(err.message);
    }
  };

  // A loop belongs to one product + radar; leaving either returns to live.
  useEffect(() => stopLoop, [product.id, station?.id, stopLoop]);

  useEffect(() => {
    if (!anim?.playing) return undefined;
    const id = setInterval(() => {
      setAnim((a) => {
        if (!a?.playing) return a;
        const last = a.times.length - 1;
        if (a.index < last) return { ...a, index: a.index + 1 };
        if (a.hold < LAST_FRAME_HOLD) return { ...a, hold: a.hold + 1 };
        return { ...a, index: 0, hold: 0 };
      });
    }, FRAME_MS);
    return () => clearInterval(id);
  }, [anim?.playing]);

  const onFramesLoaded = useCallback((n) => setAnim((a) => (a ? { ...a, loaded: Math.max(a.loaded, n) } : a)), []);

  const updateParams = useCallback(
    (changes) => {
      const next = new URLSearchParams(params);
      for (const [k, v] of Object.entries(changes)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      setParams(next, { replace: true });
    },
    [params, setParams]
  );

  const pickNearest = useCallback(() => {
    const v = viewRef.current;
    const s = nearestStation(v.lat, v.lon);
    if (s) updateParams({ site: s.id });
  }, [updateParams]);

  const selectProduct = (id) => {
    const p = getProduct(id);
    const changes = { product: id };
    // Single-site products need a radar: default to the one nearest the map center.
    if (p.scope === 'site' && !station) {
      const v = viewRef.current;
      changes.site = nearestStation(v.lat, v.lon)?.id;
    }
    updateParams(changes);
  };

  const selectStation = (id) => updateParams({ site: id });

  const onViewChange = useCallback((v) => {
    viewRef.current = v;
    writeStored(VIEW_KEY, v);
  }, []);

  useEffect(() => writeStored(OPACITY_KEY, opacity), [opacity]);

  // Full-screen page: stop the site behind it from scrolling, set the tab title.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevTitle = document.title;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
      document.title = prevTitle;
    };
  }, []);
  useEffect(() => {
    const label = product.scope === 'site' && station ? `${station.icao} ${product.short}` : product.short;
    document.title = `${label} | Radar | Weather Spectrum`;
  }, [product, station]);

  return (
    <div className="fixed inset-0 z-[55] bg-[#0b0f17] text-slate-200">
      <RadarMap
        product={product}
        layer={frame.status === 'ok' ? frame.layer : null}
        details={frame.status === 'ok' ? frame.details : null}
        opacity={opacity}
        initialView={initialView}
        onViewChange={onViewChange}
        showStations={product.scope === 'site'}
        station={station}
        onSelectStation={selectStation}
        onTileErrors={setTileErrors}
        onBasemapError={setBasemapError}
        lightning={lightningOn}
        animation={anim ? { specs: anim.specs, index: anim.index, onLoaded: onFramesLoaded } : null}
        onLightningStatus={setLightningStatus}
      />

      {/* Top-left: navigation, product button, status. pointer-events-none lets
          map drags pass through the empty space between controls. */}
      <div className="pointer-events-none absolute top-0 left-0 right-0 z-[1000] p-2 sm:p-3 flex flex-col gap-2 sm:max-w-md">
        <div className="pointer-events-auto flex items-center gap-2">
          <Link
            to="/"
            className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-700/80 bg-slate-900/85 backdrop-blur px-2.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 shadow-lg"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Weather Spectrum</span>
          </Link>
          <button
            type="button"
            onClick={() => setPanelOpen((o) => !o)}
            aria-expanded={panelOpen}
            className={`flex items-center gap-2 whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-semibold shadow-lg backdrop-blur ${
              panelOpen
                ? 'border-amber-500/70 bg-amber-500/15 text-amber-200'
                : 'border-slate-700/80 bg-slate-900/85 text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>{product.short}</span>
            {product.scope === 'site' && station && <span className="text-amber-300">{station.icao}</span>}
          </button>
          <button
            type="button"
            onClick={() => updateParams({ ltg: lightningOn ? null : '1' })}
            aria-pressed={lightningOn}
            title="Lightning (GOES GLM satellite flashes)"
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-2 text-xs font-semibold shadow-lg backdrop-blur ${
              lightningOn
                ? 'border-amber-500/70 bg-amber-500/15 text-amber-200'
                : 'border-slate-700/80 bg-slate-900/85 text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Zap className="w-4 h-4" />
            <span className="hidden sm:inline">Lightning</span>
          </button>
          {canLoop && !anim && (
            <button
              type="button"
              onClick={startLoop}
              title="Play the last 10 scans"
              className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-700/80 bg-slate-900/85 px-2.5 py-2 text-xs font-semibold text-slate-200 shadow-lg backdrop-blur hover:bg-slate-800"
            >
              <Play className="w-4 h-4" />
              <span className="hidden sm:inline">Loop</span>
            </button>
          )}
        </div>

        <ProductPanel
          open={panelOpen}
          onClose={() => setPanelOpen(false)}
          productId={product.id}
          onSelectProduct={selectProduct}
          product={product}
          station={station}
          onSelectStation={selectStation}
          onNearestStation={pickNearest}
          opacity={opacity}
          onOpacity={setOpacity}
        />

        {!panelOpen && (
          <div className="pointer-events-auto">
            <RadarStatus product={product} station={station} frame={frame} now={now} tileErrors={tileErrors} />
            {anim && (
              <div className="mt-2">
                <LoopControls
                  anim={anim}
                  onToggle={() => setAnim((a) => ({ ...a, playing: !a.playing }))}
                  onScrub={(i) => setAnim((a) => ({ ...a, index: i, playing: false, hold: 0 }))}
                  onLive={stopLoop}
                />
              </div>
            )}
            {loopError && !anim && (
              <p className="mt-2 rounded-lg border border-amber-700/60 bg-slate-900/85 px-3 py-1.5 text-xs text-amber-300">
                Loop unavailable: {loopError}
              </p>
            )}
            {product.tiltLetter && station && (
              <div className="mt-2">
                <TiltSelector
                  tilts={tilts}
                  selected={tilt}
                  onSelect={(t) => updateParams({ tilt: t === 'N0' ? null : t })}
                  loading={!tilts.length}
                />
              </div>
            )}
            {basemapError && (
              <p className="mt-2 rounded-lg border border-amber-700/60 bg-slate-900/85 px-3 py-1.5 text-xs text-amber-300">
                Background map couldn&apos;t load. Radar data is still shown.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Bottom-left legend; leaves room for zoom buttons and attribution on the right. */}
      <div className="pointer-events-none absolute left-2 right-16 bottom-10 sm:left-3 sm:right-auto sm:bottom-7 sm:w-96 z-[1000]">
        <div className="pointer-events-auto">
          {lightningOn && <GlmStatus status={lightningStatus} now={now} />}
          <RadarLegend product={product} frame={frame} />
        </div>
      </div>
    </div>
  );
}
