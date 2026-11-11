import React from 'react';
import { GLM_AGES } from '../../radar/providers/glm';

const hhmmss = (d) => d.toISOString().slice(11, 19) + 'Z';

// Legend + freshness for the GLM flash overlay.
export default function GlmStatus({ status, now }) {
  const newest = status?.newestEnd;
  const ageSec = newest ? Math.round((now - newest.getTime()) / 1000) : null;
  const lag = ageSec == null ? null : ageSec < 90 ? 'ok' : ageSec < 300 ? 'delayed' : 'stale';
  return (
    <div className="rounded-lg border border-slate-700/80 bg-slate-900/85 backdrop-blur px-3 pt-2 pb-1.5 shadow-lg mb-2">
      <div className="flex items-baseline justify-between gap-2 text-[11px] text-slate-400 mb-1">
        <span className="font-semibold text-slate-200">GOES lightning flashes</span>
        <span className="tabular-nums">
          {newest ? (
            <>
              data to {hhmmss(newest)} ·{' '}
              <span className={lag === 'stale' ? 'text-red-300' : lag === 'delayed' ? 'text-amber-300' : 'text-slate-300'}>
                {ageSec < 120 ? `${ageSec} s ago` : `${Math.round(ageSec / 60)} min ago`}
              </span>
            </>
          ) : status?.error ? (
            <span className="text-red-300">unavailable</span>
          ) : (
            'loading'
          )}
        </span>
      </div>
      <div className="flex items-center gap-3 text-[10px] text-slate-300">
        {GLM_AGES.map((a) => (
          <span key={a.label} className="flex items-center gap-1">
            <span className="text-sm leading-none font-bold" style={{ color: a.color, opacity: a.alpha }} aria-hidden>
              +
            </span>
            {a.label}
          </span>
        ))}
        <span className="ml-auto text-slate-400 tabular-nums">{status?.count != null ? `${status.count} in 15 min` : ''}</span>
      </div>
      <p className="text-[10px] leading-snug text-slate-400 mt-0.5">
        Satellite-detected total lightning (in-cloud and cloud-to-ground) from {status?.satellites?.length ? status.satellites.join('/') : 'GOES-19/18'} GLM,
        updated about once a minute. GLM pixels are 8 to 14 km wide; flash positions are typically within about 5 km near
        the satellite&apos;s center of view and less precise toward the edge. Not exact ground strike points; some flashes are missed.
      </p>
      {status?.error && newest && <p className="text-[10px] text-amber-300">Couldn&apos;t check for newer flashes.</p>}
    </div>
  );
}
