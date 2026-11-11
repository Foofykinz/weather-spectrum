import React from 'react';
import { freshnessOf } from '../../radar/useRadarFrame';

const LEVEL_STYLE = {
  live: { dot: 'bg-emerald-400', text: 'text-emerald-300', label: 'Live' },
  delayed: { dot: 'bg-amber-400', text: 'text-amber-300', label: 'Delayed' },
  stale: { dot: 'bg-red-500', text: 'text-red-300', label: 'Stale' },
  unknown: { dot: 'bg-slate-500', text: 'text-slate-300', label: '' },
};

function formatLocal(d) {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
}
function formatZulu(d) {
  return `${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}Z`;
}
function formatAge(min) {
  if (min < 1) return 'just now';
  if (min < 90) return `${Math.floor(min)} min ago`;
  return `${(min / 60).toFixed(1)} h ago`;
}

// Shows exactly which scan is on screen, how old it is, and any problems.
export default function RadarStatus({ product, station, frame, now, tileErrors }) {
  const where = product.scope === 'site' ? (station ? `${station.icao} · ${station.name}` : 'No station') : product.coverage;
  // Prefer the elevation read from the scan itself (Level III products) over the nominal one.
  const elev = frame.details?.elevation != null ? `${frame.details.elevation}°` : product.elevation;
  const tilt = elev ? ` · ${elev} tilt` : '';

  let body;
  if (frame.status === 'needs-station') {
    body = <p className="text-amber-300">Choose a radar station from the menu or tap one on the map.</p>;
  } else if (frame.status === 'loading') {
    body = <p className="text-slate-300">Checking for the latest scan…</p>;
  } else if (frame.status === 'error') {
    const msg =
      frame.error?.code === 'NO_DATA'
        ? `${product.name} isn't available for ${station?.icao || 'this radar'} right now. The radar may be offline, or this product isn't offered for it — try a neighboring radar or another product.`
        : `Radar data is unavailable right now (${frame.error?.message || 'unknown error'}). Retrying automatically.`;
    body = <p className="text-red-300">{msg}</p>;
  } else {
    const f = freshnessOf(product, frame.validTime, now);
    const s = LEVEL_STYLE[f.level];
    body = (
      <>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className={`inline-block w-2 h-2 rounded-full ${s.dot}`} aria-hidden />
          <span className={`font-semibold ${s.text}`}>{s.label}</span>
          <span className="text-slate-100 tabular-nums">
            {formatLocal(frame.validTime)} <span className="text-slate-400">({formatZulu(frame.validTime)})</span>
          </span>
          <span className="text-slate-400">· {formatAge(f.ageMin)}</span>
        </div>
        {f.level === 'stale' && (
          <p className="text-red-300 mt-0.5">This scan is old — the radar or data feed may be down. Don&apos;t rely on it for current conditions.</p>
        )}
        {frame.error && (
          <p className="text-amber-300 mt-0.5">Couldn&apos;t check for a newer scan. Showing the last one received.</p>
        )}
        {tileErrors > 3 && <p className="text-amber-300 mt-0.5">Some radar image tiles failed to load.</p>}
        {(frame.details?.radarsReporting || frame.details?.vcp != null) && (
          <p className="text-slate-400 mt-0.5">
            {frame.details.radarsReporting && `${frame.details.radarsReporting} radars reporting`}
            {frame.details.vcp != null && `VCP ${frame.details.vcp}`}
          </p>
        )}
      </>
    );
  }

  return (
    <div className="rounded-lg border border-slate-700/80 bg-slate-900/85 backdrop-blur px-3 py-2 shadow-lg text-xs leading-snug">
      <div className="text-slate-400 mb-0.5 truncate">
        <span className="text-slate-200 font-semibold">{product.name}</span> · {where}
        {tilt}
      </div>
      {body}
    </div>
  );
}
