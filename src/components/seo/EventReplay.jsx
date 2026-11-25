import React, { useEffect, useMemo, useState } from 'react';
import { Play, Pause } from 'lucide-react';
import RadarMap from '../radar/RadarMap';
import RadarLegend from '../radar/RadarLegend';
import { getProduct } from '../../radar/products';
import { getStation } from '../../radar/stations';
import { useArchive } from '../../radar/archive';
import { useWarningsHistory } from '../../radar/useWarningsHistory';
import { addSaved, startRecording } from '../../radar/savedData';

// Playable replay of a historic event: the real archived NEXRAD scans
// (Level II) from one radar, with the warnings and storm markers in effect at
// each scan. Loaded in the browser after the page itself.

// From April 2020 the Level III archive has every low-level scan, including
// the mid-volume rescans (a frame every 1-2 minutes, small files). Earlier
// events use Level II, one lowest-tilt scan per volume (every 4-5 minutes,
// which is how often radars scanned it then).
const LEVEL3_FROM = '2020-04-01';
const PRODUCTS = {
  level3: [['site-reflectivity', 'Reflectivity', undefined], ['site-vel-tilt', 'Velocity', 'N0'], ['site-cc', 'Correlation coefficient', 'N0']],
  level2: [['l2-ref', 'Reflectivity'], ['l2-vel', 'Velocity'], ['l2-cc', 'Correlation coefficient']],
};
const noop = () => {};

// The event's saved archive data (public/replays/<slug>.json, made by
// scripts/record-replays.mjs) is loaded first; anything missing from it is
// fetched as usual. ?record=1 skips it and records instead.
export default function EventReplay({ event }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    if (new URLSearchParams(window.location.search).get('record') === '1') {
      startRecording();
      setReady(true);
      return undefined;
    }
    fetch(`/replays/${event.slug}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((saved) => saved && addSaved(saved.responses))
      .catch(() => {})
      .finally(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, [event.slug]);
  if (!ready) {
    return <div className="flex h-full items-center justify-center text-sm text-slate-400">Loading the radar replay…</div>;
  }
  return <Replay event={event} />;
}

function Replay({ event }) {
  const level3 = event.date >= LEVEL3_FROM;
  // Events before dual-polarization (event.dualPol === false) have no CC.
  const options = (level3 ? PRODUCTS.level3 : PRODUCTS.level2).filter((o) => event.dualPol !== false || !o[0].endsWith('cc'));
  const [pid, setPid] = useState(options[0][0]);
  const product = getProduct(pid);
  const tilt = options.find((o) => o[0] === pid)?.[2];
  const station = getStation(event.radar);
  const end = useMemo(() => new Date(event.end.replace('Z', ':00Z')), [event.end]);
  const arch = useArchive(product, station, tilt, end, level3 ? 20 : 10);
  const frames = arch.status === 'ok' ? arch.frames : null;
  const times = useMemo(() => frames?.map((f) => f.validTime), [frames]);
  const specs = useMemo(() => frames?.map((f) => f.layer), [frames]);
  const warningsAt = useWarningsHistory(times, true);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const n = frames?.length || 0;

  useEffect(() => {
    if (!n || !playing) return undefined;
    let hold = 0;
    const id = setInterval(() => {
      setIdx((i) => {
        if (i < n - 1) return i + 1;
        if (hold++ < 3) return i;
        hold = 0;
        return 0;
      });
    }, 600);
    return () => clearInterval(id);
  }, [n, playing]);
  useEffect(() => setIdx(0), [frames]);

  const i = Math.min(idx, Math.max(0, n - 1));
  const t = times?.[i];
  const fmt = (d) => d.toLocaleTimeString('en-US', { timeZone: event.tz, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  const at = `${event.view.lat},${event.view.lon},${event.view.zoom}`;

  return (
    <div className="relative h-full w-full">
      <RadarMap
        product={product}
        layer={null}
        animation={specs ? { specs, index: i, onLoaded: noop } : null}
        details={frames?.[i]?.details || null}
        opacity={0.9}
        initialView={event.view}
        showStations={false}
        station={station}
        onSelectStation={noop}
        onTileErrors={noop}
        onBasemapError={noop}
        warnings
        warningsFrame={times ? warningsAt(t) : { loading: true, at: end }}
        storms
        stormsTime={t || end}
        stormsTimes={times}
        stormsRadar={station.id}
        liveOverlays={false}
        embed
      />
      <div className="absolute left-2 top-2 z-[1000] flex flex-wrap gap-1">
        {options.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setPid(id)}
            aria-pressed={pid === id}
            className={`rounded-md border px-2 py-1 text-xs font-semibold backdrop-blur ${
              pid === id ? 'border-sky-400/70 bg-sky-400/20 text-sky-200' : 'border-slate-700/80 bg-slate-900/85 text-slate-200 hover:bg-slate-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="absolute inset-x-2 bottom-7 z-[1000] flex flex-col gap-2 sm:left-2 sm:right-auto sm:w-96">
        <div className="pointer-events-auto">
          <RadarLegend product={product} frame={frames?.[i]} compact />
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-slate-700/80 bg-slate-900/90 px-2 py-1.5 text-xs text-slate-100">
          {frames ? (
            <>
              <button
                type="button"
                onClick={() => setPlaying((p) => !p)}
                aria-label={playing ? 'Pause replay' : 'Play replay'}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-sky-400/70 bg-sky-400/15 text-sky-200"
              >
                {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              </button>
              <span className="shrink-0 tabular-nums">
                {station.icao} {fmt(t)} <span className="text-slate-400">· {i + 1}/{n}</span>
              </span>
              <input
                type="range"
                min="0"
                max={n - 1}
                value={i}
                onChange={(e) => {
                  setPlaying(false);
                  setIdx(Number(e.target.value));
                }}
                aria-label="Replay frame"
                className="min-w-0 flex-1 accent-sky-400"
              />
            </>
          ) : arch.status === 'error' ? (
            <span className="text-red-300">The archived radar couldn&apos;t load: {arch.error?.message}</span>
          ) : (
            <span className="text-slate-300">
              Loading archived {station.icao} scans{arch.progress?.[1] ? ` ${arch.progress[0]}/${arch.progress[1]}` : ''}…
            </span>
          )}
        </div>
      </div>
      {event.date >= '2009' && (
      <a
        href={`/radar?product=${pid}&site=${station.id}${tilt && tilt !== 'N0' ? `&tilt=${tilt}` : ''}&time=${event.end}&at=${at}`}
        className="absolute right-2 top-2 z-[1000] rounded-md border border-slate-700/80 bg-slate-900/85 px-2 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-800"
      >
        Open in full radar
      </a>
      )}
    </div>
  );
}
