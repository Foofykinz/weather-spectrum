import React, { useState } from 'react';
import { ARCHIVE_START } from '../../radar/archive';

// Pick a past date and time (in your own time zone). The radar then shows the
// 10 real scans up to that moment, with the warnings in effect then.
const two = (n) => String(n).padStart(2, '0');
const toLocalInput = (d) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}T${two(d.getHours())}:${two(d.getMinutes())}`;

export default function PastPicker({ time, onShow, onLive, onClose }) {
  const [value, setValue] = useState(() => toLocalInput(time || new Date(Date.now() - 3600e3)));
  const picked = value ? new Date(value) : null; // datetime-local is read as local time
  const valid = picked && !Number.isNaN(picked.getTime()) && picked <= new Date() && picked >= ARCHIVE_START;
  const shift = (min) => {
    const base = time || picked;
    if (!base) return;
    const d = new Date(Math.min(Date.now(), base.getTime() + min * 60000));
    setValue(toLocalInput(d));
    onShow(d);
  };
  const btn = 'rounded-md border border-slate-700/80 px-2.5 py-1.5 text-xs font-semibold hover:bg-slate-800';

  return (
    <div className="pointer-events-auto w-full sm:w-80 rounded-lg border border-slate-700/80 bg-slate-900/95 backdrop-blur p-3 shadow-lg text-xs text-slate-200">
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold">Past radar</span>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-200" aria-label="Close">
          ✕
        </button>
      </div>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onShow(picked);
        }}
      >
        <input
          type="datetime-local"
          value={value}
          max={toLocalInput(new Date())}
          min="2020-04-01T00:00"
          onChange={(e) => setValue(e.target.value)}
          aria-label="Date and time (your local time)"
          className="min-w-0 flex-1 rounded-md border border-slate-700/80 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 [color-scheme:dark]"
        />
        <button type="submit" disabled={!valid} className={`${btn} border-amber-500/70 bg-amber-500/15 text-amber-200 disabled:opacity-40`}>
          Show
        </button>
      </form>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {time && (
          <>
            <button type="button" onClick={() => shift(-30)} className={btn}>
              −30 min
            </button>
            <button type="button" onClick={() => shift(30)} className={btn}>
              +30 min
            </button>
          </>
        )}
        {time && (
          <button type="button" onClick={onLive} className={`${btn} ml-auto text-emerald-300`}>
            Back to live
          </button>
        )}
      </div>
      <p className="mt-2 text-[11px] leading-snug text-slate-400">
        Shows the 10 scans up to that time, in your local time zone. Single radars come from the NOAA Level III archive;
        the national map from IEM&apos;s mosaic archive. Lightning isn&apos;t available for past dates.
      </p>
    </div>
  );
}
