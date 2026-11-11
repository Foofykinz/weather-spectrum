import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Zap, Play } from 'lucide-react';
import RadarMap from './RadarMap';
import RadarLegend from './RadarLegend';
import TiltSelector from './TiltSelector';
import GlmStatus from './GlmStatus';
import LoopControls from './LoopControls';
import LayoutSwitch from './LayoutSwitch';
import { RADAR_PRODUCTS, getProduct, productGroups, LEVEL3_TILTS } from '../../radar/products';
import { STATIONS } from '../../radar/stations';
import { listLevel3Tilts } from '../../radar/providers/level3';
import { useRadarFrame, freshnessOf } from '../../radar/useRadarFrame';

// Multi-panel radar: 2 or 4 synchronized maps. Each panel picks its own
// product and tilt; the radar station, map position, lightning and the loop
// timeline are shared. Level III panels (decoded in the browser) stay on
// their latest scan during a loop.

export const PANEL_DEFAULTS = ['site-reflectivity', 'site-velocity', 'site-cc', 'site-zdr'];
const PANEL_KEYS = ['product', 'p2', 'p3', 'p4'];
const TILT_KEYS = ['tilt', 't2', 't3', 't4'];
const SITE_PRODUCTS = RADAR_PRODUCTS.filter((p) => p.scope === 'site');
const LOOP_FRAMES = 10;
const FRAME_MS = 700;
const LAST_FRAME_HOLD = 3;
const LOOP_TOLERANCE_MS = 90 * 1000;

const zulu = (d) => `${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}Z`;
const dot = { live: 'bg-emerald-400', delayed: 'bg-amber-400', stale: 'bg-red-500', unknown: 'bg-slate-500' };

// Drawing size for browser-decoded scans: enough pixels for this panel only
// (keeps memory down when four panels are open on a phone).
function useDrawSize(ref) {
  const [size, setSize] = useState(1024);
  useEffect(() => {
    if (!ref.current) return undefined;
    const measure = () => {
      const r = ref.current.getBoundingClientRect();
      const px = Math.max(r.width, r.height) * Math.min(window.devicePixelRatio || 1, 2) * 1.2;
      setSize(Math.max(768, Math.min(2048, Math.round(px / 256) * 256)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

function RadarPanel({ index, product, tilt, station, onProduct, onTilt, onSelectStation, shared, loop }) {
  const box = useRef(null);
  const drawSize = useDrawSize(box);
  const tiltKey = product.tiltLetter ? tilt || 'N0' : undefined;
  const frame = useRadarFrame(product, product.scope === 'site' ? station : null, tiltKey, drawSize);
  const groups = useMemo(() => productGroups().map(([g, list]) => [g, list.filter((p) => p.scope === 'site')]).filter(([, l]) => l.length), []);

  // Available tilts with their real angles, refreshed with each new scan.
  const [tilts, setTilts] = useState({ key: null, list: [] });
  const tk = product.tiltLetter && station ? `${station.id}:${product.tiltLetter}` : null;
  const scanTime = frame.validTime?.getTime();
  useEffect(() => {
    if (!tk) return undefined;
    const c = new AbortController();
    listLevel3Tilts(station, product.tiltLetter, LEVEL3_TILTS, c.signal).then((list) => setTilts({ key: tk, list })).catch(() => {});
    return () => c.abort();
  }, [tk, scanTime]); // eslint-disable-line react-hooks/exhaustive-deps

  const looping = loop && loop.specs;
  const shownTime = looping ? loop.times[loop.index] : frame.validTime;
  const f = freshnessOf(product, frame.validTime, shared.now);
  const elev = frame.details?.elevation ? `${frame.details.elevation}°` : product.elevation;

  return (
    <div ref={box} className="relative min-h-0 min-w-0 overflow-hidden bg-[#0b0f17]">
      <RadarMap
        product={product}
        layer={frame.status === 'ok' ? frame.layer : null}
        details={frame.status === 'ok' ? frame.details : null}
        opacity={shared.opacity}
        initialView={shared.initialView}
        onViewChange={shared.onViewChange}
        showStations
        station={station}
        onSelectStation={onSelectStation}
        onTileErrors={() => {}}
        onBasemapError={() => {}}
        lightning={shared.lightningOn}
        onLightningStatus={index === 0 ? shared.onLightningStatus : undefined}
        animation={looping ? { specs: loop.specs, index: loop.index, onLoaded: loop.onLoaded } : null}
        syncGroup={shared.syncGroup}
        primary={index === 0}
        splitBasemap={false}
        keepInitialView={shared.keepInitialView}
      />

      <div className="pointer-events-none absolute top-0 left-0 right-0 z-[1000] p-1.5 flex flex-col items-start gap-1">
        <div className="pointer-events-auto flex max-w-full items-center gap-1 rounded-md border border-slate-700/80 bg-slate-900/90 backdrop-blur px-1.5 py-1 shadow-lg">
          <select
            value={product.id}
            onChange={(e) => onProduct(e.target.value)}
            aria-label={`Panel ${index + 1} product`}
            className="max-w-[9.5rem] sm:max-w-[13rem] truncate bg-transparent text-xs font-semibold text-slate-100 focus:outline-none"
          >
            {groups.map(([g, list]) => (
              <optgroup key={g} label={g}>
                {list.map((p) => (
                  <option key={p.id} value={p.id} className="bg-slate-900">
                    {p.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="pointer-events-auto rounded-md border border-slate-700/80 bg-slate-900/90 backdrop-blur px-2 py-1 text-[11px] leading-tight shadow-lg tabular-nums">
          {frame.status === 'ok' && shownTime ? (
            <span className="flex items-center gap-1.5 text-slate-200">
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${dot[looping ? 'unknown' : f.level]}`} aria-hidden />
              {zulu(shownTime)}
              {!looping && <span className="text-slate-400">· {Math.max(0, Math.floor(f.ageMin))} min</span>}
              {elev && <span className="text-slate-400">· {elev}</span>}
            </span>
          ) : frame.status === 'error' ? (
            <span className="text-red-300">{frame.error?.code === 'NO_DATA' ? `Not available for ${station?.icao}` : 'Unavailable'}</span>
          ) : (
            <span className="text-slate-400">Loading…</span>
          )}
          {loop && !looping && frame.status === 'ok' && <span className="block text-amber-300">Latest scan, not animated</span>}
        </div>
        {product.tiltLetter && tilts.key === tk && tilts.list.length > 0 && (
          <div className="pointer-events-auto scale-90 origin-top-left">
            <TiltSelector tilts={tilts.list} selected={tiltKey} onSelect={onTilt} />
          </div>
        )}
      </div>

      <div className="pointer-events-none absolute left-1.5 right-12 bottom-6 z-[1000] sm:right-auto sm:w-72">
        <div className="pointer-events-auto">
          <RadarLegend product={product} frame={frame} compact />
        </div>
      </div>
    </div>
  );
}

export default function MultiRadar({ layout, params, updateParams, station, onSelectStation, onLayout, initialView, onViewChange, opacity, now, keepInitialView = false }) {
  const panels = PANEL_KEYS.slice(0, layout).map((k, i) => {
    const p = getProduct(params.get(k) || PANEL_DEFAULTS[i]);
    return p.scope === 'site' ? p : getProduct(PANEL_DEFAULTS[i]); // panels are single-radar views
  });
  const tilts = TILT_KEYS.slice(0, layout).map((k) => (LEVEL3_TILTS.includes(params.get(k)) ? params.get(k) : 'N0'));
  const lightningOn = params.get('ltg') === '1';
  const [lightningStatus, setLightningStatus] = useState(null);
  const syncGroup = useMemo(() => ({ maps: new Set(), syncing: false }), []);

  // ---- synchronized loop
  const [anim, setAnim] = useState(null); // { ref: [Date], perPanel: [{ times, specs } | null], index, playing, loaded, hold }
  const [loopError, setLoopError] = useState(null);
  const req = useRef(null);
  const panelKey = panels.map((p) => p.id).join(',');
  const stopLoop = useCallback(() => {
    req.current?.abort();
    setAnim(null);
  }, []);
  useEffect(() => stopLoop, [panelKey, station?.id, layout, stopLoop]);

  const startLoop = async () => {
    req.current?.abort();
    const c = new AbortController();
    req.current = c;
    setLoopError(null);
    try {
      const perPanel = await Promise.all(
        panels.map(async (p) => {
          if (!p.frames) return null;
          const times = await p.frames(station, LOOP_FRAMES, c.signal);
          return times.length ? { times, specs: times.map((t) => p.layer(station, t)) } : null;
        })
      );
      if (c.signal.aborted) return;
      const ref = perPanel.find(Boolean)?.times;
      if (!ref || ref.length < 2) throw new Error('No panel in this view can be animated.');
      setAnim({ ref, perPanel, index: 0, playing: true, loaded: 0, hold: 0 });
    } catch (err) {
      if (err.name !== 'AbortError') setLoopError(err.message);
    }
  };

  useEffect(() => {
    if (!anim?.playing) return undefined;
    const id = setInterval(() => {
      setAnim((a) => {
        if (!a?.playing) return a;
        if (a.index < a.ref.length - 1) return { ...a, index: a.index + 1 };
        if (a.hold < LAST_FRAME_HOLD) return { ...a, hold: a.hold + 1 };
        return { ...a, index: 0, hold: 0 };
      });
    }, FRAME_MS);
    return () => clearInterval(id);
  }, [anim?.playing]);
  const onLoaded = useCallback((n) => setAnim((a) => (a ? { ...a, loaded: Math.max(a.loaded, n) } : a)), []);

  // Each animated panel shows its newest frame at or before the shared time.
  const loopFor = (i) => {
    if (!anim) return null;
    const pp = anim.perPanel[i];
    if (!pp) return {}; // panel present in the loop but not animated
    const t = anim.ref[anim.index].getTime() + LOOP_TOLERANCE_MS;
    let idx = 0;
    pp.times.forEach((d, j) => {
      if (d.getTime() <= t) idx = j;
    });
    return { specs: pp.specs, times: pp.times, index: idx, onLoaded };
  };

  const shared = { now, opacity, initialView, onViewChange, lightningOn, onLightningStatus: setLightningStatus, syncGroup, keepInitialView };
  const setPanel = (i, id) => updateParams({ [PANEL_KEYS[i]]: id });
  const setTilt = (i, t) => updateParams({ [TILT_KEYS[i]]: t === 'N0' ? null : t });
  const canLoop = panels.some((p) => p.frames);

  return (
    <div className="fixed inset-0 z-[55] flex flex-col bg-[#0b0f17] text-slate-200">
      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-white/10 bg-slate-900/95 px-2 py-1.5">
        <Link to="/" aria-label="Weather Spectrum home" className="flex items-center gap-1 rounded-md border border-slate-700/80 px-2 py-1.5 text-xs font-semibold hover:bg-slate-800">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <LayoutSwitch layout={layout} onChange={onLayout} />
        <select
          value={station?.id || ''}
          onChange={(e) => onSelectStation(e.target.value)}
          aria-label="Radar station"
          className="min-w-0 max-w-[9rem] sm:max-w-[14rem] rounded-md border border-slate-700/80 bg-slate-900 px-1.5 py-1.5 text-xs text-slate-100"
        >
          {STATIONS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.icao} · {s.name}, {s.state}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => updateParams({ ltg: lightningOn ? null : '1' })}
          aria-pressed={lightningOn}
          title="Lightning (GOES GLM satellite flashes)"
          className={`flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-1.5 text-xs font-semibold ${lightningOn ? 'border-amber-500/70 bg-amber-500/15 text-amber-200' : 'border-slate-700/80 hover:bg-slate-800'}`}
        >
          <Zap className="w-4 h-4" />
          <span className="hidden sm:inline">Lightning</span>
        </button>
        {canLoop && !anim && (
          <button type="button" onClick={startLoop} title="Play the last 10 scans in all panels" className="flex items-center gap-1 whitespace-nowrap rounded-md border border-slate-700/80 px-2 py-1.5 text-xs font-semibold hover:bg-slate-800">
            <Play className="w-4 h-4" />
            <span className="hidden sm:inline">Loop</span>
          </button>
        )}
      </div>

      {(anim || loopError || lightningOn) && (
        <div className="pointer-events-none absolute right-2 top-14 z-[1100] w-[calc(100%-1rem)] max-w-sm space-y-2">
          {anim && (
            <div className="pointer-events-auto">
              <LoopControls
                anim={{ times: anim.ref, index: anim.index, playing: anim.playing, loaded: Math.min(anim.loaded, anim.ref.length) }}
                onToggle={() => setAnim((a) => ({ ...a, playing: !a.playing }))}
                onScrub={(i) => setAnim((a) => ({ ...a, index: i, playing: false, hold: 0 }))}
                onLive={stopLoop}
              />
            </div>
          )}
          {loopError && !anim && <p className="pointer-events-auto rounded-lg border border-amber-700/60 bg-slate-900/90 px-3 py-1.5 text-xs text-amber-300">Loop unavailable: {loopError}</p>}
          {lightningOn && (
            <div className="pointer-events-auto">
              <GlmStatus status={lightningStatus} now={now} />
            </div>
          )}
        </div>
      )}

      <div className={`grid flex-1 min-h-0 gap-px bg-slate-700 ${layout === 4 ? 'grid-cols-2 grid-rows-2' : 'grid-rows-2 md:grid-rows-1 md:grid-cols-2'}`}>
        {panels.map((p, i) => (
          <RadarPanel
            key={i}
            index={i}
            product={p}
            tilt={tilts[i]}
            station={station}
            onProduct={(id) => setPanel(i, id)}
            onTilt={(t) => setTilt(i, t)}
            onSelectStation={onSelectStation}
            shared={shared}
            loop={loopFor(i)}
          />
        ))}
      </div>
    </div>
  );
}

export { SITE_PRODUCTS };
