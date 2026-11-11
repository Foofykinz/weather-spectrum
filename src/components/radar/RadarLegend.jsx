import React from 'react';
import { COLOR_SCALES, legendGradient, tickPosition } from '../../radar/colorScales';

export default function RadarLegend({ product }) {
  const scale = COLOR_SCALES[product.colorScale];
  if (!scale) return null;
  return (
    <div className="rounded-lg border border-slate-700/80 bg-slate-900/85 backdrop-blur px-3 pt-2 pb-1 shadow-lg">
      <div className="flex items-baseline justify-between text-[11px] text-slate-400 mb-1">
        <span className="font-semibold text-slate-200">{product.short}</span>
        <span>{scale.units}</span>
      </div>
      <div className="h-3 rounded-sm" style={{ background: legendGradient(scale) }} />
      <div className="relative h-4 text-[10px] text-slate-300 tabular-nums">
        {scale.ticks.map((t) => (
          <span key={t} className="absolute -translate-x-1/2" style={{ left: `${tickPosition(scale, t)}%` }}>
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}
