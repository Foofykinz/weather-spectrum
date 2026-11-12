import React from 'react';
import { WARNING_TYPES, WATCH_TYPES } from '../../radar/providers/warnings';

const hhmmz = (d) => d.toISOString().slice(11, 16).replace(':', '') + 'Z';

// Active NWS warnings and watches (whole US) by type, in their map colors.
// During a loop it shows what was in effect at the frame on screen.
export default function WarningsStatus({ status, now, compact = false }) {
  const s = status;
  const counts = new Map();
  let emergencies = 0;
  for (const w of s?.warnings || []) {
    counts.set(w.type.event, (counts.get(w.type.event) || 0) + 1);
    if (w.danger === 'emergency') emergencies++;
  }
  for (const w of s?.watches || []) counts.set(w.type.event, (counts.get(w.type.event) || 0) + 1);
  const types = [...WARNING_TYPES, ...WATCH_TYPES].filter((t) => counts.has(t.event));
  const looping = !!s?.at;
  const ageMin = !looping && s?.updated ? Math.floor((now - s.updated.getTime()) / 60000) : null;
  const ready = looping ? !s.loading : !!s?.updated;

  return (
    <div
      className={`rounded-lg border border-slate-700/80 bg-slate-900/85 backdrop-blur px-3 py-1.5 shadow-lg text-[11px] ${compact ? '' : 'mb-2'}`}
      title="National Weather Service warnings and watches in effect (whole US). Click a spot on the map for details."
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-slate-400">
        <span className="font-semibold text-slate-200">Warnings</span>
        {looping && <span className="tabular-nums">at {hhmmz(s.at)}</span>}
        {!ready && !s?.error && <span>loading</span>}
        {ready && emergencies > 0 && <span className="font-semibold text-red-400">{emergencies} emergency</span>}
        {ready &&
          (types.length ? (
            types.map((t) => (
              <span key={t.event} className="flex items-center gap-1 text-slate-300 whitespace-nowrap">
                <span className="inline-block w-2.5 h-2.5 rounded-sm border border-black/60" style={{ background: t.color }} aria-hidden />
                {counts.get(t.event)} {t.short}
              </span>
            ))
          ) : (
            <span className="text-slate-300">none in effect</span>
          ))}
        {s?.error && <span className="text-red-300">{ready ? 'some data unavailable' : 'unavailable'}</span>}
        {ageMin != null && ageMin >= 3 && <span className="text-amber-300">checked {ageMin} min ago</span>}
      </div>
    </div>
  );
}
