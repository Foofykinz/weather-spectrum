import React, { useState } from 'react';
import { Info } from 'lucide-react';
import { LEGENDS, legendGradient, rampGradient, tickPosition, radarMode } from '../../radar/legends';

const box = 'rounded-lg border border-slate-700/80 bg-slate-900/85 backdrop-blur px-3 pt-2 pb-1.5 shadow-lg';

function Header({ title, units, info, onInfo }) {
  return (
    <div className="flex items-center gap-2 text-[11px] text-slate-400 mb-1">
      <span className="font-semibold text-slate-200">{title}</span>
      {units && <span className="ml-auto">{units}</span>}
      {onInfo && (
        <button
          type="button"
          onClick={onInfo}
          aria-expanded={info}
          aria-label="About this legend"
          className={`${units ? '' : 'ml-auto '}shrink-0 rounded p-0.5 ${info ? 'text-amber-300' : 'text-slate-400 hover:text-slate-200'}`}
        >
          <Info className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

const Note = ({ children }) => <p className="ws-legend-note text-[10px] leading-snug text-slate-400 mt-1">{children}</p>;

function GradientLegend({ legend }) {
  return (
    <>
      <div className="h-3 rounded-sm" style={{ background: legendGradient(legend) }} />
      <div className="relative h-4 text-[10px] text-slate-300 tabular-nums">
        {legend.ticks.map((t) => (
          <span key={t} className="absolute -translate-x-1/2" style={{ left: `${tickPosition(legend, t)}%` }}>
            {t}
          </span>
        ))}
      </div>
      {legend.note && <Note>{legend.note}</Note>}
    </>
  );
}

function RampLegend({ legend }) {
  return (
    <>
      <div className="h-3 rounded-sm" style={{ background: rampGradient(legend) }} />
      <div className="relative h-4 text-[10px] text-slate-300 tabular-nums">
        {legend.ticks.map((t) => (
          <span key={t} className="absolute -translate-x-1/2" style={{ left: `${tickPosition(legend, t)}%` }}>
            {t}
          </span>
        ))}
      </div>
      {legend.note && <Note>{legend.note}</Note>}
    </>
  );
}

// Official provider legend image, shown unchanged.
function ImageLegend({ legend }) {
  return (
    <>
      <img src={legend.src} alt={legend.alt} className="w-full h-auto rounded-sm" width="500" height="34" />
      {legend.note && <Note>{legend.note}</Note>}
    </>
  );
}

// Classified data: one swatch per category. Compact code strip by default,
// full names on request (keeps the map visible on phones).
function CategoryLegend({ legend }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <div className="flex rounded-sm overflow-hidden">
        {legend.items.map((it) => (
          <div key={it.code} className="flex-1 min-w-0" title={it.name}>
            <div className="h-3" style={{ background: it.color }} />
            <div className={`text-center text-[9px] leading-4 ${it.hail ? 'text-red-300 font-semibold' : 'text-slate-300'}`}>
              {it.code}
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className="ws-legend-more text-[10px] text-amber-300 hover:text-amber-200"
      >
        {expanded ? 'Hide category names' : 'Show category names'}
      </button>
      {expanded && (
        <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-1 text-[10px] text-slate-200">
          {legend.items.map((it) => (
            <li key={it.code} className="flex items-center gap-1.5 min-w-0">
              <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: it.color }} />
              <span className="font-semibold text-slate-400 w-5 shrink-0">{it.code}</span>
              <span className="truncate">{it.name}</span>
            </li>
          ))}
        </ul>
      )}
      {legend.note && <Note>{legend.note}</Note>}
    </>
  );
}

// Fixed data levels whose values depend on the radar's operating mode.
function LevelsLegend({ legend, frame }) {
  const vcp = frame?.details?.vcp;
  const modeKey = radarMode(vcp);
  const mode = modeKey ? legend.modes[modeKey] : null;
  // Before we know the mode, show the colors without numbers rather than guess.
  const colors = mode ? mode.colors : legend.modes.precip.colors;
  return (
    <>
      <div className="flex rounded-sm overflow-hidden">
        {colors.map((c, i) => (
          <div key={i} className="flex-1 min-w-0">
            <div className="h-3" style={{ background: c }} />
            <div className="text-center text-[9px] leading-4 text-slate-300 tabular-nums">
              {mode ? (mode.levels[i] > 0 ? `+${mode.levels[i]}` : mode.levels[i]) : ''}
            </div>
          </div>
        ))}
        <div className="flex-1 min-w-0 ml-0.5">
          <div className="h-3" style={{ background: legend.rf }} />
          <div className="text-center text-[9px] leading-4 text-slate-300">RF</div>
        </div>
      </div>
      <Note>
        {mode
          ? `${mode.label}${vcp != null ? ` (VCP ${vcp})` : ''}: level values change with the radar's mode. `
          : 'Level values depend on the radar’s operating mode, which is not known yet. '}
        {legend.note}
      </Note>
    </>
  );
}

// Notes sit behind an info button so the color scale is all that shows by default.
// compact: smaller box with no notes at all (multi-panel views, embeds).
export default function RadarLegend({ product, frame, compact = false }) {
  const [info, setInfo] = useState(false);
  const legend = LEGENDS[product.legend];
  if (!legend) return null;
  const hasNote = !compact && (legend.note || legend.type === 'levels');
  const cls = compact
    ? 'ws-legend-compact rounded-md border border-slate-700/80 bg-slate-900/85 backdrop-blur px-2 pt-1 pb-0.5 shadow-lg'
    : `${box}${info ? '' : ' ws-legend-hide-notes'}`;
  return (
    <div className={cls}>
      <Header title={product.short} units={legend.units} info={info} onInfo={hasNote ? () => setInfo((v) => !v) : null} />
      {legend.type === 'gradient' && <GradientLegend legend={legend} />}
      {legend.type === 'image' && <ImageLegend legend={legend} />}
      {legend.type === 'ramps' && <RampLegend legend={legend} />}
      {legend.type === 'categories' && <CategoryLegend legend={legend} />}
      {legend.type === 'levels' && <LevelsLegend legend={legend} frame={frame} />}
    </div>
  );
}
