import React, { useEffect, useMemo, useRef, useState } from 'react';
import RadarMap from '../radar/RadarMap';
import { getProduct } from '../../radar/products';
import { useRadarFrame } from '../../radar/useRadarFrame';
import { useArchive, loadArchive } from '../../radar/archive';
import { nearestStation } from '../../radar/stations';
import { stormsAt, subscribeStorms, selectStorms, compassOf } from '../../radar/providers/storms';
import { warningName, bannerText, bannerTime, zoneForStation } from '../../radar/post';
import { boundsOf, narration, pastDetails } from '../../broadcast/event';

// One warning on screen during event mode: the nearest radar zoomed to the
// warning, reflectivity (and velocity beside it for tornado warnings), a
// banner, and narration quoted from the NWS warning text.
// replay: a Date to show a past moment instead of live data.

const REF = getProduct('site-reflectivity');
const VEL = getProduct('site-vel-tilt');
const noop = () => {};
const shadow = { textShadow: '2px 2px 0 rgba(0,0,0,0.55)' };

// The last 10 real scans up to `end`, for looping. Live: the newest single
// scan shows right away while the loop loads.
// While a refreshed loop loads, the previous one keeps playing.
function useRadarLoop(product, station, tilt, end, live, enabled = true) {
  const still = useRadarFrame(product, live && enabled ? station : null, tilt, undefined, !(live && enabled));
  const arch = useArchive(enabled ? product : null, station, tilt, end);
  const kept = useRef(null); // { id, frames }
  const id = `${product.id}|${station.id}|${tilt || ''}`;
  if (arch.status === 'ok' && arch.frames.length > 1) kept.current = { id, frames: arch.frames };
  if (!enabled) return null;
  const frames = kept.current?.id === id ? kept.current.frames : null;
  const stillTime = live && still.status === 'ok' ? still.validTime : null;
  const latest = frames ? frames[frames.length - 1] : stillTime ? still : null;
  return { frames, latest, stillTime };
}

function Pane({ product, loop, index, station, label, initialView, mapRef, group, replay, width, tz }) {
  const specs = useMemo(() => loop?.frames?.map((f) => f.layer), [loop?.frames]);
  const i = specs ? Math.min(index, specs.length - 1) : 0;
  const scan = loop?.frames ? loop.frames[i] : loop?.latest;
  return (
    <div className="relative h-full" style={{ width }}>
      <RadarMap
        product={product}
        layer={specs ? null : scan?.layer || null}
        animation={specs ? { specs, index: i, onLoaded: noop } : null}
        details={scan?.details || null}
        opacity={0.9}
        initialView={initialView}
        onViewChange={noop}
        showStations={false}
        station={station}
        onSelectStation={noop}
        onTileErrors={noop}
        onBasemapError={noop}
        warnings
        warningsFrame={replay ? replay.warningsFrame : undefined}
        storms
        stormsTime={replay?.time}
        stormsRadar={station.id}
        primary={false}
        embed
        syncGroup={group}
        mapRef={mapRef}
        splitBasemap={false}
      />
      <div className="pointer-events-none absolute top-[92px] left-4 z-[600] bg-[#0c1638]/85 px-3 py-1 text-[24px] font-semibold text-slate-100" style={shadow}>
        {label} &middot; {station.icao}
        {scan ? ` · ${scan.validTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz || undefined, timeZoneName: 'short' })}` : ' · loading'}
        {scan && !specs && <span className="text-slate-400"> (loop loading)</span>}
      </div>
    </div>
  );
}

export default function EventView({ warning, list, index, replay, width, height }) {
  const { box, center } = useMemo(() => boundsOf(warning.geometry), [warning]);
  const station = useMemo(() => nearestStation(center[0], center[1]), [center]);

  // Load the next warning's scans in the background (a few seconds in, so this
  // warning's own scans go first); switching to it is then instant.
  const next = list.length > 1 ? list[(index + 1) % list.length] : null;
  useEffect(() => {
    if (!next || next.id === warning.id) return undefined;
    const c = new AbortController();
    const t = setTimeout(() => {
      const ns = nearestStation(...boundsOf(next.geometry).center);
      const at = replay?.time || new Date();
      const quiet = () => {};
      loadArchive(REF, ns, undefined, at, c.signal, quiet).catch(quiet);
      if (next.type.phen === 'TO' || next.type.phen === 'EW') loadArchive(VEL, ns, 'N0', at, c.signal, quiet).catch(quiet);
    }, 6000);
    return () => {
      clearTimeout(t);
      c.abort();
    };
  }, [next?.id, warning.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const split = warning.type.phen === 'TO' || warning.type.phen === 'EW';
  const group = useMemo(() => ({ maps: new Set(), syncing: false }), []);
  const mapRef = useRef(null);
  // Loop end: the replay moment, or "now", refreshed every few minutes
  // (scans already loaded are reused from the cache).
  const [liveEnd, setLiveEnd] = useState(() => new Date());
  const end = replay?.time || liveEnd;
  const ref = useRadarLoop(REF, station, undefined, end, !replay);
  const vel = useRadarLoop(VEL, station, 'N0', end, !replay, split);
  // Live: the newest scan is checked every minute; as soon as one is newer
  // than the loop's last frame, reload the loop so it ends on it.
  const newest = Math.max(ref?.stillTime?.getTime() || 0, vel?.stillTime?.getTime() || 0);
  const loopLast = Math.min(ref?.frames?.at(-1)?.validTime.getTime() ?? Infinity, split ? vel?.frames?.at(-1)?.validTime.getTime() ?? Infinity : Infinity);
  const refreshedFor = useRef(0);
  useEffect(() => {
    if (replay || !newest || loopLast === Infinity || newest <= loopLast || refreshedFor.current === newest) return;
    refreshedFor.current = newest; // once per new scan, even if the archive lags a moment
    setLiveEnd(new Date());
  }, [newest, loopLast, replay]);
  // Play both panes in step: half a second per scan, a pause on the newest.
  const [frameIdx, setFrameIdx] = useState(0);
  const nFrames = ref?.frames?.length || 0;
  useEffect(() => {
    if (!nFrames) return undefined;
    let hold = 0;
    setFrameIdx(0);
    const id = setInterval(() => {
      setFrameIdx((i) => {
        if (i < nFrames - 1) return i + 1;
        if (hold++ < 4) return i;
        hold = 0;
        return 0;
      });
    }, 500);
    return () => clearInterval(id);
  }, [nFrames, ref?.frames]);
  const [details, setDetails] = useState(null); // replay: text + counties from IEM
  const [storms, setStorms] = useState([]);

  const state = (warning.area || '').match(/,\s*([A-Z]{2})\b/)?.[1] || station.state;
  const tz = zoneForStation({ state });

  // Frame the warning polygon.
  useEffect(() => {
    const map = mapRef.current;
    if (map) map.fitBounds(box, { padding: [120, 120], maxZoom: 10, animate: false });
  }, [box, ref?.latest ? 1 : 0]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!replay) return undefined;
    let alive = true;
    pastDetails(warning, replay.time.getTime()).then((d) => alive && setDetails(d));
    return () => {
      alive = false;
    };
  }, [warning, replay]);

  // Rotation / hail detections inside the warning box (radar algorithms).
  useEffect(() => {
    const pick = (all) => setStorms(selectStorms(all, station.id).filter((s) => s.lat >= box[0][0] && s.lat <= box[1][0] && s.lon >= box[0][1] && s.lon <= box[1][1]));
    if (replay) {
      stormsAt(replay.time).then(pick).catch(() => setStorms([]));
      return undefined;
    }
    return subscribeStorms((d) => pick(d.storms));
  }, [station, box, replay]);

  const w = details?.area ? { ...warning, area: details.area } : warning;
  const lines = narration(details?.text ?? warning.text);
  // A short strip: where the storm is and how it moves, hazard and source on
  // one line, and the towns in its path. (The long impact text is left out.)
  const get = (label) => lines.find((l) => l.label === label)?.text;
  const shown = [
    get('Storm') && { label: 'Storm', text: get('Storm') },
    (get('Hazard') || get('Source')) && { label: 'Hazard', text: [get('Hazard'), get('Source') && `Source: ${get('Source')}`].filter(Boolean).join('  ·  ') },
    get('In the path') && { label: 'In the path', text: get('In the path') },
  ].filter(Boolean);
  const top = storms.find((s) => s.tvs) || storms.find((s) => s.meso) || storms[0];
  const detection = top
    ? [top.tvs ? 'Tornado vortex signature' : null, top.meso != null ? `mesocyclone (strength ${top.meso})` : null, top.hail >= 0.75 ? `hail estimate ${top.hail.toFixed(2)} in` : null, top.mph ? `moving ${compassOf(top.toward)} at ${top.mph} mph` : null]
        .filter(Boolean)
        .join(', ')
    : null;
  const initialView = { lat: center[0], lon: center[1], zoom: 9 };
  const color = warning.type.color;
  const dark = ['#FFFF00', '#FFE4C4', '#00FF00'].includes(color.toUpperCase());

  return (
    <div className="absolute inset-0" style={{ width, height }}>
      <div className="flex h-full">
        <Pane product={REF} loop={ref} index={frameIdx} station={station} label="Reflectivity" initialView={initialView} mapRef={mapRef} group={group} replay={replay} tz={tz} width={split ? width / 2 : width} />
        {split && (
          <>
            <div className="h-full w-[4px] bg-[#0b1530]" />
            <Pane product={VEL} loop={vel} index={frameIdx} station={station} label="Velocity" initialView={initialView} group={group} replay={replay} tz={tz} width={width / 2 - 4} />
          </>
        )}
      </div>

      {/* Banner */}
      <div className="absolute left-0 right-0 top-0 z-[700] flex items-stretch" style={shadow}>
        <div className="px-8 py-3 text-[56px] font-bold uppercase leading-none" style={{ background: color, color: dark ? '#0b1530' : '#fff' }}>
          {warningName(w)}
        </div>
        <div className="flex flex-1 items-center justify-between bg-[#0c1638]/90 px-8">
          <span className="truncate text-[38px] font-semibold text-white">{bannerText(w) || w.office}</span>
          <span className="ml-6 whitespace-nowrap text-[34px] font-semibold text-amber-300">{bannerTime(w, tz)}</span>
        </div>
      </div>

      {/* Other event warnings */}
      {list.length > 1 && (
        <div className="absolute right-6 top-[96px] z-[700] w-[420px] bg-[#0c1638]/90 p-3 text-[22px]" style={shadow}>
          <div className="mb-1 text-[20px] font-bold uppercase tracking-wide text-amber-300">
            Active ({index + 1} of {list.length})
          </div>
          {list.slice(0, 7).map((x, i) => (
            <div key={x.id} className={`flex items-center gap-2 py-0.5 ${i === index ? 'text-white' : 'text-slate-400'}`}>
              <span className="inline-block h-3 w-3 shrink-0" style={{ background: x.type.color }} />
              <span className="truncate">{warningName(x)}</span>
              <span className="ml-auto truncate text-[18px]">{(x.area || x.office || '').split(';')[0]}</span>
            </div>
          ))}
          {list.length > 7 && <div className="text-slate-400">+ {list.length - 7} more</div>}
        </div>
      )}

      {/* Narration: quoted from the NWS warning */}
      {(shown.length > 0 || detection) && (
        <div key={warning.id} className="absolute bottom-[56px] left-6 right-6 z-[700] bg-[#0c1638]/90 px-5 py-3" style={{ borderLeft: `8px solid ${color}`, ...shadow }}>
          <div className="mb-1 text-[18px] font-bold uppercase tracking-wide text-amber-300">From the National Weather Service warning</div>
          {shown.map((l, i) => (
            <div key={l.label} className="ws-bc-line mb-1 text-[25px] leading-snug text-white" style={{ animationDelay: `${0.4 + i * 1.2}s` }}>
              <span className="font-bold text-amber-200">{l.label}: </span>
              {l.text}
            </div>
          ))}
          {detection && (
            <div className="ws-bc-line text-[22px] text-slate-200" style={{ animationDelay: `${0.4 + shown.length * 1.2}s` }}>
              <span className="font-bold text-amber-200">Radar detection: </span>
              {detection} (automated, NWS radar algorithms)
            </div>
          )}
        </div>
      )}
    </div>
  );
}
