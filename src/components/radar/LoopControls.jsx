import React from 'react';
import { Play, Pause } from 'lucide-react';

const zulu = (d) => `${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}Z`;
const local = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

// Loop controls in one row: play/pause, frame time, scrubber, back to live.
export default function LoopControls({ anim, onToggle, onScrub, onLive }) {
  const n = anim.times.length;
  const t = anim.times[anim.index];
  const loading = anim.loaded < n;
  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-700/80 bg-slate-900/85 backdrop-blur px-2 py-1.5 shadow-lg text-xs">
      <button
        type="button"
        onClick={onToggle}
        aria-label={anim.playing ? 'Pause loop' : 'Play loop'}
        className="w-7 h-7 shrink-0 flex items-center justify-center rounded-md border border-amber-500/70 bg-amber-500/15 text-amber-200"
      >
        {anim.playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
      </button>
      <span className="shrink-0 tabular-nums text-slate-100" title={`${local(t)} · frame ${anim.index + 1} of ${n}`}>
        {zulu(t)}
        <span className="text-slate-400"> {loading ? `· loading ${anim.loaded}/${n}` : `· ${anim.index + 1}/${n}`}</span>
      </span>
      <input
        type="range"
        min="0"
        max={n - 1}
        value={anim.index}
        onChange={(e) => onScrub(Number(e.target.value))}
        aria-label="Loop frame"
        className="flex-1 min-w-0 accent-amber-500"
      />
      <button type="button" onClick={onLive} className="shrink-0 rounded-md border border-slate-700 px-2 py-1 font-semibold text-slate-200 hover:bg-slate-800">
        Live
      </button>
    </div>
  );
}
