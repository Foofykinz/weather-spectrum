import React from 'react';
import { Play, Pause } from 'lucide-react';

const zulu = (d) => `${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}Z`;
const local = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

// Loop controls: play/pause, scrub through frames, return to live.
export default function LoopControls({ anim, onToggle, onScrub, onLive }) {
  const n = anim.times.length;
  const t = anim.times[anim.index];
  return (
    <div className="rounded-lg border border-slate-700/80 bg-slate-900/85 backdrop-blur px-3 py-2 shadow-lg text-xs">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggle}
          aria-label={anim.playing ? 'Pause loop' : 'Play loop'}
          className="w-8 h-8 flex items-center justify-center rounded-md border border-amber-500/70 bg-amber-500/15 text-amber-200"
        >
          {anim.playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-slate-100 tabular-nums">
            Loop · {local(t)} <span className="text-slate-400">({zulu(t)})</span>
            <span className="text-slate-400"> · frame {anim.index + 1} of {n}</span>
          </div>
          {anim.loaded < n && <div className="text-[10px] text-slate-400">Loading frames {anim.loaded} of {n}</div>}
        </div>
        <button type="button" onClick={onLive} className="rounded-md border border-slate-700 px-2 py-1 font-semibold text-slate-200 hover:bg-slate-800">
          Live
        </button>
      </div>
      <input
        type="range"
        min="0"
        max={n - 1}
        value={anim.index}
        onChange={(e) => onScrub(Number(e.target.value))}
        aria-label="Loop frame"
        className="mt-2 w-full accent-amber-500"
      />
    </div>
  );
}
