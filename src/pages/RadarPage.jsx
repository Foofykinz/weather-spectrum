import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Layers, ArrowLeft, Play, History, Image as ImageIcon, SlidersHorizontal } from 'lucide-react';
import PostMaker from '../components/radar/PostMaker';
import LoopControls from '../components/radar/LoopControls';
import LayoutSwitch from '../components/radar/LayoutSwitch';
import MultiRadar from '../components/radar/MultiRadar';
import { snapshotMap } from '../radar/snapshot';
import RadarMap from '../components/radar/RadarMap';
import RadarLegend from '../components/radar/RadarLegend';
import RadarStatus from '../components/radar/RadarStatus';
import ProductPanel from '../components/radar/ProductPanel';
import OverlayPanel from '../components/radar/OverlayPanel';
import GlmStatus from '../components/radar/GlmStatus';
import WarningsStatus from '../components/radar/WarningsStatus';
import PastPicker from '../components/radar/PastPicker';
import { useArchive, loadArchive, timeFromParam, timeToParam } from '../radar/archive';
import { getProduct, DEFAULT_PRODUCT_ID, LEVEL3_TILTS, archiveProductId } from '../radar/products';
import { getStation, nearestStation } from '../radar/stations';
import { useRadarFrame, useNow } from '../radar/useRadarFrame';
import { useWarningsHistory } from '../radar/useWarningsHistory';
import { useZoneAlertsLayer, useStationObsLayer } from '../radar/useZoneOverlays';
import { activateAlertStyle, getAlertStyle, setAlertStyle, subscribeAlertStyle } from '../radar/alertStyle';

// Per-viewer conveniences only (last map view & opacity). Safe if storage is blocked.
const VIEW_KEY = 'ws.radar.view';
const OPACITY_KEY = 'ws.radar.opacity';
const BASEMAP_KEY = 'ws.radar.basemap';
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

// Optional start position from a link: &at=lat,lon,zoom (e.g. from a city page).
function viewFromParam(value) {
  const [lat, lon, zoom] = String(value || '').split(',').map(Number);
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 85 && Math.abs(lon) <= 180
    ? { lat, lon, zoom: Number.isFinite(zoom) ? Math.min(12, Math.max(3, Math.round(zoom))) : 8 }
    : null;
}

const noop = () => {};

function SingleRadar() {
  // Product and station live in the URL, so a view can be bookmarked or shared:
  //   /radar?product=site-reflectivity&site=TLX
  const [params, setParams] = useSearchParams();
  const product = getProduct(params.get('product') || DEFAULT_PRODUCT_ID);
  const station = getStation((params.get('site') || '').toUpperCase());

  const [initialView] = useState(() => {
    const fromLink = viewFromParam(params.get('at'));
    if (fromLink) return fromLink;
    const v = readStored(VIEW_KEY, DEFAULT_VIEW);
    return Number.isFinite(v?.lat) && Number.isFinite(v?.lon) && Number.isFinite(v?.zoom) ? v : DEFAULT_VIEW;
  });
  const viewRef = useRef(initialView);
  const [opacity, setOpacity] = useState(() => {
    const o = Number(readStored(OPACITY_KEY, 0.85));
    return o >= 0.1 && o <= 1 ? o : 0.85;
  });
  const [basemap, setBasemapState] = useState(() => (readStored(BASEMAP_KEY, 'dark') === 'terrain' ? 'terrain' : 'dark'));
  const setBasemap = (b) => {
    setBasemapState(b);
    writeStored(BASEMAP_KEY, b);
  };
  const [panelOpen, setPanelOpen] = useState(false);
  const [overlaysOpen, setOverlaysOpen] = useState(false);
  // The viewer's alert colors and opacity (radar tool only).
  const [alertStyle, setAlertStyleState] = useState(getAlertStyle);
  useEffect(() => {
    const off = activateAlertStyle();
    const unsub = subscribeAlertStyle(setAlertStyleState);
    return () => {
      unsub();
      off();
    };
  }, []);
  const [tileErrors, setTileErrors] = useState(0);
  const [basemapError, setBasemapError] = useState(null);

  // Elevation tilt (Level III products only), also kept in the URL: &tilt=NA
  const tiltParam = params.get('tilt');
  // Level II products take the elevation angle itself: &tilt=1.3 (empty = lowest).
  const tilt = product.tiltLetter
    ? LEVEL3_TILTS.includes(tiltParam) ? tiltParam : 'N0'
    : product.listTilts && /^\d{1,2}\.\d$/.test(tiltParam || '') ? tiltParam : undefined;
  const lightningOn = params.get('ltg') === '1';
  const [lightningStatus, setLightningStatus] = useState(null);
  const warningsOn = params.get('warn') !== '0'; // on unless turned off
  const stormsOn = params.get('storms') !== '0'; // storm markers, on unless turned off
  const [warningsStatus, setWarningsStatus] = useState(null);
  // Wind and winter alerts (on unless &zones=0) and station readings (&obs=temps|wind).
  const zonesOn = params.get('zones') !== '0';
  const obsMode = ['temps', 'wind'].includes(params.get('obs')) ? params.get('obs') : null;

  // Past radar (&time=2024-05-06T20:00Z): real archived scans up to that time.
  const pastTime = timeFromParam(params.get('time'));
  const past = !!pastTime;
  const [pickerOpen, setPickerOpen] = useState(false);
  const liveFrame = useRadarFrame(product, product.scope === 'site' ? station : null, tilt, undefined, past);
  const archive = useArchive(past ? product : null, product.scope === 'site' ? station : null, tilt, pastTime);
  const pastFrames = past && archive.status === 'ok' ? archive.frames : null;
  const [pastAnim, setPastAnim] = useState({ index: 0, playing: false, hold: 0 });
  useEffect(() => {
    if (pastFrames) setPastAnim({ index: pastFrames.length - 1, playing: false, hold: 0 });
  }, [pastFrames]);
  const shown = pastFrames ? pastFrames[Math.min(pastAnim.index, pastFrames.length - 1)] : null;
  const frame = !past
    ? liveFrame
    : product.scope === 'site' && !station
      ? { status: 'needs-station' }
      : shown
        ? { status: 'ok', past: true, validTime: shown.validTime, details: shown.details, layer: shown.layer }
        : archive.status === 'error'
          ? { status: 'error', past: true, error: archive.error }
          : { status: 'loading', past: true, progress: archive.progress };
  const now = useNow();
  const mapRef = useRef(null);
  const zones = useZoneAlertsLayer(mapRef, zonesOn && !past);
  const obs = useStationObsLayer(mapRef, past ? null : obsMode);
  const [post, setPost] = useState(null); // null | { busy: true } | { snap, base } | { error }

  // ---- Radar loop (products with a `frames` list: IEM and NWS imagery).
  const LOOP_FRAMES = 10;
  const FRAME_MS = 600;
  const LAST_FRAME_HOLD = 3; // extra ticks on the newest frame before restarting
  const site = product.scope === 'site' ? station : null;
  // Image products loop from their provider's frame list; decoded single-radar
  // products loop from the NOAA Level III files (same loader as past radar).
  const canLoop = (!!product.frames || !!product.archive) && (product.scope !== 'site' || !!station);
  const [loopProgress, setLoopProgress] = useState(null); // [done, total] while decoded frames load
  const [anim, setAnim] = useState(null); // { times, specs, index, playing, loaded, hold }
  const [loopError, setLoopError] = useState(null);
  const loopReq = useRef(null);
  const pastSpecs = React.useMemo(() => pastFrames?.map((f) => f.layer), [pastFrames]);
  const [video, setVideo] = useState(null); // { specs, times, index } while frames for a video are captured
  const warnTimes = video ? video.times : pastFrames ? pastFrames.map((f) => f.validTime) : anim?.times;
  const warningsAtTime = useWarningsHistory(warnTimes, warningsOn && (video || pastFrames ? true : !!anim));
  const warnIndex = video ? video.index : pastFrames ? Math.min(pastAnim.index, pastFrames.length - 1) : anim?.index;

  // Past mode: products with no archive switch to the closest one that has one.
  useEffect(() => {
    if (!past) return;
    const target = archiveProductId(product.id, pastTime);
    if (target !== product.id) updateParamsRef.current({ product: target, tilt: null });
  }, [past, product, pastTime?.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps
  // Past loop playback (same pacing as the live loop).
  useEffect(() => {
    if (!pastAnim.playing || !pastFrames) return undefined;
    const id = setInterval(() => {
      setPastAnim((a) => {
        if (!a.playing) return a;
        if (a.index < pastFrames.length - 1) return { ...a, index: a.index + 1 };
        if (a.hold < LAST_FRAME_HOLD) return { ...a, hold: a.hold + 1 };
        return { ...a, index: 0, hold: 0 };
      });
    }, FRAME_MS);
    return () => clearInterval(id);
  }, [pastAnim.playing, pastFrames]); // eslint-disable-line react-hooks/exhaustive-deps

  const stopLoop = useCallback(() => {
    loopReq.current?.abort();
    setAnim(null);
    setLoopProgress(null);
  }, []);

  const startLoop = async () => {
    loopReq.current?.abort();
    const controller = new AbortController();
    loopReq.current = controller;
    setLoopError(null);
    try {
      const decoded = product.archive && product.scope === 'site'; // same sharp source as the still image
      if (!decoded) {
        const times = await product.frames(site, LOOP_FRAMES, controller.signal);
        if (controller.signal.aborted) return;
        if (times.length < 2) throw new Error('Not enough recent scans to loop.');
        setAnim({ times, specs: times.map((t) => product.layer(site, t)), index: 0, playing: true, loaded: 0, hold: 0 });
      } else {
        setLoopProgress([0, 0]);
        const frames = await loadArchive(product, site, tilt, new Date(), controller.signal, (d, n) => !controller.signal.aborted && setLoopProgress([d, n]));
        if (controller.signal.aborted) return;
        if (frames.length < 2) throw new Error('Not enough recent scans to loop.');
        // Decoded frames are ready at once: count them all as loaded.
        setAnim({ times: frames.map((f) => f.validTime), specs: frames.map((f) => f.layer), index: 0, playing: true, loaded: frames.length, hold: 0 });
      }
    } catch (err) {
      if (err.name !== 'AbortError') setLoopError(err.message);
    } finally {
      if (loopReq.current === controller) setLoopProgress(null);
    }
  };

  // A loop belongs to one product + radar; leaving either returns to live.
  useEffect(() => stopLoop, [product.id, station?.id, tilt, stopLoop]);

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
  const updateParamsRef = useRef(updateParams);
  updateParamsRef.current = updateParams;
  const showPast = (d) => {
    stopLoop();
    updateParams({ time: d ? timeToParam(d) : null });
  };

  // Alerts a post can mention: the warnings / watches on the map (when shown)
  // and the wind and winter alerts (when shown).
  const postAlerts = (map) => {
    const zoneList = zonesOn && !past ? map._wsZoneAlerts || [] : [];
    if (!warningsOn && !zoneList.length) return null;
    return { ...(warningsOn ? map._wsWarnings : {}), zones: zoneList };
  };

  // Post maker: pause any loop, then copy the map as it is on screen.
  const scanTime = anim ? anim.times[anim.index] : frame.status === 'ok' ? frame.validTime : null;
  const openPost = async () => {
    const map = mapRef.current;
    if (!map || !scanTime) return;
    setAnim((a) => (a ? { ...a, playing: false } : a));
    setPastAnim((a) => ({ ...a, playing: false }));
    setPost({ busy: true });
    try {
      const snap = await snapshotMap(map);
      setPost({
        snap,
        base: { product, station: product.scope === 'site' ? station : null, time: scanTime, past, frame, alerts: postAlerts(map) },
      });
    } catch (err) {
      setPost({ error: err.message || 'The map picture could not be made.' });
    }
  };

  // ?post=1 (from the weather graphics page): open the post maker once the
  // radar is up, giving the map a moment to draw its tiles first.
  const autoPost = useRef(params.get('post') === '1');
  const openPostRef = useRef(openPost);
  openPostRef.current = openPost;
  useEffect(() => {
    if (!autoPost.current || !scanTime || !mapRef.current) return;
    autoPost.current = false;
    setTimeout(() => openPostRef.current(), 2500);
  }, [scanTime]);

  // Video: show each loop scan on the map in turn and copy it, with the
  // warnings in effect at that scan. Returns [{ snap, time, alerts, details }].
  const makeVideoFrames = async (onProgress) => {
    const map = mapRef.current;
    const ctl = new AbortController();
    let src;
    if (pastFrames) src = pastFrames;
    else if (anim) src = anim.times.map((t, i) => ({ validTime: t, layer: anim.specs[i] }));
    else if (product.archive && (product.scope !== 'site' || station))
      src = await loadArchive(product, site, tilt, new Date(), ctl.signal, (d, n) => onProgress(`Loading scans ${d}/${n}`));
    else if (canLoop) src = (await product.frames(site, LOOP_FRAMES, ctl.signal)).map((t) => ({ validTime: t, layer: product.layer(site, t) }));
    else throw new Error('This product has no loop to make a video from.');
    if (src.length < 2) throw new Error('Not enough scans for a video.');
    const times = src.map((f) => f.validTime);
    const box = map.getContainer().getBoundingClientRect();
    const scale = Math.min(2, Math.max(1, 1700 / box.height));
    const wait = async (ok, ms) => {
      for (let t = 0; t < ms && !ok(); t += 100) await new Promise((r) => setTimeout(r, 100));
    };
    const out = [];
    setVideo({ specs: src.map((f) => f.layer), times, index: 0 });
    try {
      for (let i = 0; i < src.length; i++) {
        onProgress(`Drawing scan ${i + 1}/${src.length}`);
        setVideo((v) => ({ ...v, index: i }));
        const t = times[i].getTime();
        await wait(() => {
          const w = map._wsWarnings;
          return !warningsOn || (w && !w.loading && w.at?.getTime?.() === t);
        }, 20000);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const snap = await snapshotMap(map, scale);
        out.push({ snap, time: times[i], alerts: postAlerts(map), details: src[i].details });
      }
    } finally {
      setVideo(null);
    }
    return out;
  };

  const pickNearest = useCallback(() => {
    const v = viewRef.current;
    const s = nearestStation(v.lat, v.lon);
    if (s) updateParams({ site: s.id });
  }, [updateParams]);

  // Picked from the menu: a product, plus a tilt when chosen from its Tilt menu.
  const selectProduct = (id, tiltValue = null) => {
    const p = getProduct(id);
    const changes = { product: id, tilt: tiltValue };
    // Single-site products need a radar: default to the one nearest the map center.
    if (p.scope === 'site' && !station) {
      const v = viewRef.current;
      changes.site = nearestStation(v.lat, v.lon)?.id;
    }
    updateParams(changes);
    // On phones the menu covers the map: close it so the choice is visible.
    if (window.innerWidth < 640) setPanelOpen(false);
  };

  const selectStation = (id) => updateParams({ site: id });

  // Dual/quad views are single-radar views: make sure a radar is selected.
  const setLayout = (n) => {
    if (n === 1) return;
    const v = viewRef.current;
    updateParams({ layout: String(n), site: station?.id || nearestStation(v.lat, v.lon)?.id });
  };

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
        keepInitialView={!!viewFromParam(params.get('at'))}
        onTileErrors={setTileErrors}
        onBasemapError={setBasemapError}
        basemap={basemap}
        lightning={lightningOn && !past}
        animation={
          video
            ? { specs: video.specs, index: video.index, onLoaded: noop }
            : pastFrames && pastAnim.playing
            ? { specs: pastSpecs, index: pastAnim.index, onLoaded: noop }
            : anim
              ? { specs: anim.specs, index: anim.index, onLoaded: onFramesLoaded }
              : null
        }
        onLightningStatus={setLightningStatus}
        warnings={warningsOn}
        warningsFrame={warnTimes && (video || pastFrames || anim) ?warningsAtTime(warnTimes[warnIndex]) : undefined}
        onWarningsStatus={setWarningsStatus}
        storms={stormsOn}
        stormsTime={warnTimes && (video || pastFrames || anim) ? warnTimes[warnIndex] : undefined}
        stormsRadar={product.scope === 'site' ? station?.id || null : null}
        stormsTimes={video || pastFrames || anim ? warnTimes : undefined}
        mapRef={mapRef}
      />

      {post?.snap && <PostMaker snap={post.snap} base={post.base} makeVideoFrames={makeVideoFrames} onClose={() => setPost(null)} />}

      {/* Top-left: navigation, product button, status. pointer-events-none lets
          map drags pass through the empty space between controls. */}
      <div className="pointer-events-none absolute top-0 left-0 right-0 z-[1000] p-2 sm:p-3 flex flex-col gap-2 max-h-[100dvh] sm:max-w-2xl">
        <div className="pointer-events-auto flex flex-wrap items-center gap-2">
          <Link
            to="/"
            className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-700/80 bg-slate-900/85 backdrop-blur px-2.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 shadow-lg"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Weather Spectrum</span>
          </Link>
          <button
            type="button"
            onClick={() => {
              setPanelOpen((o) => !o);
              setOverlaysOpen(false);
            }}
            aria-expanded={panelOpen}
            className={`flex items-center gap-2 whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-semibold shadow-lg backdrop-blur ${
              panelOpen
                ? 'border-sky-400/70 bg-sky-400/15 text-sky-200'
                : 'border-slate-700/80 bg-slate-900/85 text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>{product.short}</span>
            {product.scope === 'site' && station && <span className="text-sky-300">{station.icao}</span>}
          </button>
          <button
            type="button"
            onClick={() => {
              setOverlaysOpen((o) => !o);
              setPanelOpen(false);
              setPickerOpen(false);
            }}
            aria-expanded={overlaysOpen}
            title="Warnings, storm markers, lightning, wind and winter alerts, station readings"
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-2 text-xs font-semibold shadow-lg backdrop-blur ${
              overlaysOpen
                ? 'border-sky-400/70 bg-sky-400/15 text-sky-200'
                : 'border-slate-700/80 bg-slate-900/85 text-slate-200 hover:bg-slate-800'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>Overlays</span>
            <span className="rounded bg-slate-700/80 px-1.5 text-[11px] text-slate-200">{[lightningOn && !past, warningsOn, stormsOn, zonesOn && !past, !!obsMode && !past].filter(Boolean).length}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setPickerOpen((o) => !o);
              setOverlaysOpen(false);
            }}
            aria-pressed={past}
            aria-expanded={pickerOpen}
            title="Past radar: pick a date and time"
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-2 text-xs font-semibold shadow-lg backdrop-blur ${
              past || pickerOpen
                ? 'border-sky-400/70 bg-sky-400/15 text-sky-200'
                : 'border-slate-700/80 bg-slate-900/85 text-slate-200 hover:bg-slate-800'
            }`}
          >
            <History className="w-4 h-4" />
            <span className="hidden sm:inline">Past</span>
          </button>
          <button
            type="button"
            onClick={openPost}
            disabled={!scanTime || post?.busy}
            title="Make an image and caption for a social media post"
            className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-700/80 bg-slate-900/85 px-2.5 py-2 text-xs font-semibold text-slate-200 shadow-lg backdrop-blur hover:bg-slate-800 disabled:opacity-40"
          >
            <ImageIcon className="w-4 h-4" />
            <span className="hidden sm:inline">{post?.busy ? 'Preparing...' : 'Post'}</span>
          </button>
          {!past && <LayoutSwitch layout={1} onChange={setLayout} />}
          {canLoop && !anim && !past && (
            <button
              type="button"
              onClick={startLoop}
              disabled={!!loopProgress}
              title="Play the last 10 scans"
              className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-700/80 bg-slate-900/85 px-2.5 py-2 text-xs font-semibold text-slate-200 shadow-lg backdrop-blur hover:bg-slate-800"
            >
              <Play className="w-4 h-4" />
              <span className="hidden sm:inline">
                {loopProgress ? `Loading ${loopProgress[0]}/${loopProgress[1] || '...'}` : 'Loop'}
              </span>
            </button>
          )}
        </div>

        <ProductPanel
          open={panelOpen}
          onClose={() => setPanelOpen(false)}
          productId={product.id}
          tiltParam={tilt}
          onSelectProduct={selectProduct}
          product={product}
          station={station}
          onSelectStation={selectStation}
          onNearestStation={pickNearest}
          opacity={opacity}
          onOpacity={setOpacity}
          pastMode={past}
        />

        <OverlayPanel
          open={overlaysOpen && !panelOpen}
          onClose={() => setOverlaysOpen(false)}
          warnings={warningsOn}
          storms={stormsOn}
          lightning={lightningOn}
          zones={zonesOn}
          obs={obsMode}
          onChange={updateParams}
          alertStyle={alertStyle}
          onAlertStyle={setAlertStyle}
          basemap={basemap}
          onBasemap={setBasemap}
          pastMode={past}
        />

        {pickerOpen && !panelOpen && !overlaysOpen && (
          <PastPicker
            key={pastTime ? pastTime.getTime() : 'live'}
            time={pastTime}
            onShow={(d) => showPast(d)}
            onLive={() => {
              showPast(null);
              setPickerOpen(false);
            }}
            onClose={() => setPickerOpen(false)}
          />
        )}

        {!panelOpen && !overlaysOpen && (
          <div className="pointer-events-auto sm:max-w-md">
            <RadarStatus product={product} station={station} frame={frame} now={now} tileErrors={tileErrors} />
            {pastFrames && (
              <div className="mt-2">
                <LoopControls
                  anim={{ times: pastFrames.map((f) => f.validTime), index: Math.min(pastAnim.index, pastFrames.length - 1), playing: pastAnim.playing, loaded: pastFrames.length }}
                  onToggle={() => setPastAnim((a) => ({ ...a, playing: !a.playing }))}
                  onScrub={(i) => setPastAnim((a) => ({ ...a, index: i, playing: false, hold: 0 }))}
                  onLive={() => showPast(null)}
                />
              </div>
            )}
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
            {post?.error && (
              <p className="mt-2 rounded-lg border border-amber-700/60 bg-slate-900/85 px-3 py-1.5 text-xs text-amber-300">
                Couldn&apos;t make the post image: {post.error}
              </p>
            )}
            {basemapError && (
              <p className="mt-2 rounded-lg border border-amber-700/60 bg-slate-900/85 px-3 py-1.5 text-xs text-amber-300">
                Background map couldn&apos;t load. Radar data is still shown.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Bottom-left legend; leaves room for zoom buttons and attribution on the right.
          While the product or overlay panel is open it moves beside the panel on wide screens and
          steps aside on narrower ones, so the two never overlap. */}
      <div
        className={`pointer-events-none absolute left-2 right-16 bottom-6 sm:left-3 sm:right-auto sm:bottom-7 sm:w-96 z-[1000] ${
          panelOpen || overlaysOpen ? 'hidden lg:block lg:left-[22rem]' : ''
        }`}
      >
        <div className="pointer-events-auto">
          {warningsOn && <WarningsStatus status={warningsStatus} now={now} />}
          {zonesOn && !past && zones.error && (
            <div className="mb-1.5 rounded-md bg-slate-900/85 px-2.5 py-1 text-[11px] text-amber-300">Wind and winter alerts couldn't load. Retrying.</div>
          )}
          {obsMode && !past && (
            <div className="mb-1.5 rounded-md bg-slate-900/85 px-2.5 py-1 text-[11px] text-slate-300">
              {obs.tooFar
                ? 'Zoom in to see station readings.'
                : obsMode === 'wind'
                  ? <>Wind at airport stations, mph: <b className="text-orange-300">bold</b> = gust, smaller = steady wind (no gust reported). Last hour.</>
                  : 'Temperatures at airport stations, °F. Readings from the last 90 minutes.'}
            </div>
          )}
          {lightningOn && !past && <GlmStatus status={lightningStatus} now={now} />}
          <RadarLegend product={product} frame={frame} />
        </div>
      </div>
    </div>
  );
}

// Multi-panel layouts (?layout=2 or 4). Shares the URL, saved view and opacity
// with the single view, so switching back keeps your place.
function MultiRadarPage({ layout }) {
  const [params, setParams] = useSearchParams();
  const station = getStation((params.get('site') || '').toUpperCase());
  const [initialView] = useState(() => {
    const fromLink = viewFromParam(params.get('at'));
    if (fromLink) return fromLink;
    const v = readStored(VIEW_KEY, DEFAULT_VIEW);
    return Number.isFinite(v?.lat) && Number.isFinite(v?.lon) && Number.isFinite(v?.zoom) ? v : DEFAULT_VIEW;
  });
  const viewRef = useRef(initialView);
  const opacity = (() => {
    const o = Number(readStored(OPACITY_KEY, 0.85));
    return o >= 0.1 && o <= 1 ? o : 0.85;
  })();
  const now = useNow();

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

  // A multi-panel view always needs a radar.
  useEffect(() => {
    if (!station) {
      const v = viewRef.current;
      updateParams({ site: nearestStation(v.lat, v.lon)?.id });
    }
  }, [station]); // eslint-disable-line react-hooks/exhaustive-deps

  const onViewChange = useCallback((v) => {
    viewRef.current = v;
    writeStored(VIEW_KEY, v);
  }, []);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);
  useEffect(() => {
    document.title = `${station ? station.icao + ' ' : ''}${layout === 4 ? 'Quad' : 'Dual'} view | Radar | Weather Spectrum`;
  }, [station, layout]);

  if (!station) return <div className="fixed inset-0 z-[55] bg-[#0b0f17]" />;
  return (
    <MultiRadar
      layout={layout}
      params={params}
      updateParams={updateParams}
      station={station}
      onSelectStation={(id) => updateParams({ site: id })}
      onLayout={(n) => updateParams({ layout: n === 1 ? null : String(n) })}
      initialView={initialView}
      onViewChange={onViewChange}
      opacity={opacity}
      basemap={readStored(BASEMAP_KEY, 'dark') === 'terrain' ? 'terrain' : 'dark'}
      now={now}
      keepInitialView={!!viewFromParam(params.get('at'))}
    />
  );
}

export default function RadarPage() {
  const [params] = useSearchParams();
  const n = Number(params.get('layout'));
  // Past radar is single-view only.
  return (n === 2 || n === 4) && !params.get('time') ? <MultiRadarPage layout={n} /> : <SingleRadar />;
}
