import React, { useMemo } from 'react';
import { X, Crosshair } from 'lucide-react';
import { productGroups } from '../../radar/products';
import { STATIONS } from '../../radar/stations';
import ProductMenu from './ProductMenu';

// Collapsible control panel: radar station, product choice, opacity.
// Products are one-line rows; only the selected one shows its description.
// Products with elevation tilts have a Tilt box that opens the tilt menu.
export default function ProductPanel({
  open,
  onClose,
  productId,
  tiltParam,
  onSelectProduct,
  product,
  station,
  onSelectStation,
  onNearestStation,
  opacity,
  onOpacity,
}) {
  const groups = useMemo(() => productGroups(), []);
  const stationsByState = useMemo(() => {
    const m = new Map();
    for (const s of STATIONS) {
      if (!m.has(s.state)) m.set(s.state, []);
      m.get(s.state).push(s);
    }
    return [...m.entries()];
  }, []);

  if (!open) return null;

  return (
    <div className="pointer-events-auto w-full sm:w-80 min-h-0 flex flex-col rounded-lg border border-slate-700/80 bg-slate-900/95 backdrop-blur shadow-2xl text-sm text-slate-200">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700/80">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Radar</h2>
        <button type="button" onClick={onClose} aria-label="Close panel" className="p-1 rounded hover:bg-slate-700">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Station first: it applies to most products and used to sit below a long scroll. */}
      <div className="px-3 py-2 border-b border-slate-800">
        <div className="flex gap-1.5">
          <select
            id="radar-station"
            aria-label="Radar station"
            value={station?.id || ''}
            onChange={(e) => onSelectStation(e.target.value)}
            className="flex-1 min-w-0 rounded-md bg-slate-800 border border-slate-700 px-2 py-1.5 text-slate-100 focus:outline-none focus:border-amber-500"
          >
            {!station && <option value="">Select a radar…</option>}
            {stationsByState.map(([state, list]) => (
              <optgroup key={state} label={state}>
                {list.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.icao} · {s.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <button
            type="button"
            onClick={onNearestStation}
            title="Radar nearest the center of the map"
            className="shrink-0 rounded-md border border-slate-700 px-2 hover:bg-slate-800"
          >
            <Crosshair className="w-4 h-4" />
            <span className="sr-only">Nearest radar to map center</span>
          </button>
        </div>
        {product.scope !== 'site' && (
          <p className="text-[11px] text-slate-500 mt-1">Used by single-site products. You can also tap a radar on the map.</p>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <ProductMenu groups={groups} productId={productId} tiltParam={tiltParam} station={station} onPick={onSelectProduct} />
      </div>

      <div className="px-3 py-2 border-t border-slate-800 flex items-center gap-3">
        <label htmlFor="radar-opacity" className="text-[11px] uppercase tracking-wider text-slate-500 shrink-0">
          Opacity
        </label>
        <input
          id="radar-opacity"
          type="range"
          min="0.1"
          max="1"
          step="0.05"
          value={opacity}
          onChange={(e) => onOpacity(Number(e.target.value))}
          className="flex-1 min-w-0 accent-amber-500"
        />
        <span className="w-9 text-right text-xs tabular-nums text-slate-300">{Math.round(opacity * 100)}%</span>
      </div>
    </div>
  );
}
