import React from 'react';

// Row of elevation-angle buttons for tilt-capable products. Angles come from
// the radar files themselves (see listLevel3Tilts), so they always reflect
// the radar's current scan strategy.
export default function TiltSelector({ tilts, selected, onSelect, loading }) {
  if (!tilts?.length) {
    return loading ? (
      <div className="rounded-lg border border-slate-700/80 bg-slate-900/85 px-3 py-1.5 text-[11px] text-slate-400 shadow-lg">
        Finding available tilts…
      </div>
    ) : null;
  }
  return (
    <div
      role="radiogroup"
      aria-label="Elevation tilt"
      className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-700/80 bg-slate-900/85 backdrop-blur px-2 py-1.5 shadow-lg"
    >
      <span className="text-[10px] uppercase tracking-wider text-slate-500 mr-1">Tilt</span>
      {tilts.map((t) => {
        const active = t.tilt === selected;
        return (
          <button
            key={t.tilt}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onSelect(t.tilt)}
            className={`rounded px-2 py-1 text-xs tabular-nums font-semibold border ${
              active ? 'border-amber-500/70 bg-amber-500/15 text-amber-200' : 'border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
          >
            {t.elevation.toFixed(1)}°
          </button>
        );
      })}
    </div>
  );
}
