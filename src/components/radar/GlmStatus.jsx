import React, { useState } from 'react';
import { Info } from 'lucide-react';
import { GLM_AGES } from '../../radar/providers/glm';

const hhmmss = (d) => d.toISOString().slice(11, 19) + 'Z';

// Compact legend + freshness for the GLM flash overlay. The accuracy notes
// are one tap away instead of always on screen.
// compact: one line; the flash-age key joins the notes behind the info button.
export default function GlmStatus({ status, now, compact = false }) {
  const [info, setInfo] = useState(false);
  const newest = status?.newestEnd;
  const ageSec = newest ? Math.round((now - newest.getTime()) / 1000) : null;
  const lag = ageSec == null ? null : ageSec < 90 ? 'ok' : ageSec < 300 ? 'delayed' : 'stale';
  return (
    <div className={`rounded-lg border border-slate-700/80 bg-slate-900/85 backdrop-blur px-3 py-1.5 shadow-lg text-[11px] ${compact ? '' : 'mb-2'}`}>
      <div className="flex items-center gap-2 text-slate-400">
        <span className="font-semibold text-slate-200">Lightning</span>
        <span className="tabular-nums truncate">
          {newest ? (
            <span
              title={`Data to ${hhmmss(newest)}`}
              className={lag === 'stale' ? 'text-red-300' : lag === 'delayed' ? 'text-amber-300' : 'text-slate-300'}
            >
              {ageSec < 120 ? `${ageSec} s ago` : `${Math.round(ageSec / 60)} min ago`}
            </span>
          ) : status?.error ? (
            <span className="text-red-300">unavailable</span>
          ) : (
            'loading'
          )}
          {status?.count != null && <span> · {status.count} in 15 min</span>}
        </span>
        <button
          type="button"
          onClick={() => setInfo((v) => !v)}
          aria-expanded={info}
          aria-label="About lightning data"
          className={`ml-auto shrink-0 rounded p-0.5 ${info ? 'text-amber-300' : 'text-slate-400 hover:text-slate-200'}`}
        >
          <Info className="w-3.5 h-3.5" />
        </button>
      </div>
      {(!compact || info) && (
      <div className="flex items-center gap-3 text-[10px] text-slate-300">
        {GLM_AGES.map((a) => (
          <span key={a.label} className="flex items-center gap-1">
            <span className="text-sm leading-none font-bold" style={{ color: a.color, opacity: a.alpha }} aria-hidden>
              +
            </span>
            {a.label}
          </span>
        ))}
      </div>
      )}
      {info && (
        <p className="text-[10px] leading-snug text-slate-400 mt-1">
          Satellite-detected total lightning (in-cloud and cloud-to-ground) from{' '}
          {status?.satellites?.length ? status.satellites.join('/') : 'GOES-19/18'} GLM, updated about once a minute
          {newest ? `, data to ${hhmmss(newest)}` : ''}. GLM pixels are 8 to 14 km wide; flash positions are typically
          within about 5 km near the satellite&apos;s center of view and less precise toward the edge. Not exact ground
          strike points; some flashes are missed.
        </p>
      )}
      {status?.error && newest && <p className="text-[10px] text-amber-300">Couldn&apos;t check for newer flashes.</p>}
    </div>
  );
}
