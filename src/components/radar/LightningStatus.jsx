import React from 'react';
import { LIGHTNING_LEGEND } from '../../radar/legends';

const zulu = (d) => `${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}Z`;

// Compact legend + freshness for the lightning overlay.
export default function LightningStatus({ status, now }) {
  const newest = status?.newest;
  const age = newest ? Math.round((now - newest.getTime()) / 60000) : null;
  const level = age == null ? 'unknown' : age >= 75 ? 'stale' : age >= 45 ? 'delayed' : 'ok';
  return (
    <div className="rounded-lg border border-slate-700/80 bg-slate-900/85 backdrop-blur px-3 pt-2 pb-1.5 shadow-lg mb-2">
      <div className="flex items-baseline justify-between text-[11px] text-slate-400 mb-1">
        <span className="font-semibold text-slate-200">Lightning density, 15 min</span>
        <span>
          {newest ? (
            <>
              period {zulu(newest)} ·{' '}
              <span className={level === 'stale' ? 'text-red-300' : level === 'delayed' ? 'text-amber-300' : 'text-slate-300'}>
                {age} min ago
              </span>
            </>
          ) : status?.error ? (
            <span className="text-red-300">unavailable</span>
          ) : (
            'loading'
          )}
        </span>
      </div>
      <div className="flex rounded-sm overflow-hidden">
        {LIGHTNING_LEGEND.classes.map(([v, c], i) => (
          <div key={v} className="flex-1 min-w-0">
            <div className="h-2.5" style={{ background: c }} />
            <div className="text-center text-[9px] leading-4 text-slate-300 tabular-nums">{LIGHTNING_LEGEND.labels[i] || ''}</div>
          </div>
        ))}
      </div>
      <p className="text-[10px] leading-snug text-slate-400">
        {LIGHTNING_LEGEND.units}. Ground-network detections on an 8 km grid; previous period shown faded. Not individual strike locations.
      </p>
      {status?.error && newest && <p className="text-[10px] text-amber-300">Couldn&apos;t check for a newer period.</p>}
    </div>
  );
}
