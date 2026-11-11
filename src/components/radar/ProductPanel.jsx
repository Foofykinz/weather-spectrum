import React, { useMemo } from 'react';
import { X, Crosshair } from 'lucide-react';
import { productGroups } from '../../radar/products';
import { STATIONS } from '../../radar/stations';

// Collapsible control panel: product choice, radar station, opacity.
export default function ProductPanel({
  open,
  onClose,
  productId,
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
    <div className="pointer-events-auto w-full sm:w-80 max-h-[calc(100dvh-8rem)] overflow-y-auto rounded-lg border border-slate-700/80 bg-slate-900/95 backdrop-blur shadow-2xl text-sm text-slate-200">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/80">
        <h2 className="font-semibold tracking-wide text-slate-100">Radar products</h2>
        <button type="button" onClick={onClose} aria-label="Close panel" className="p-1 rounded hover:bg-slate-700">
          <X className="w-4 h-4" />
        </button>
      </div>

      {groups.map(([group, products]) => (
        <section key={group} className="px-4 py-3 border-b border-slate-800">
          <h3 className="text-[11px] uppercase tracking-wider text-slate-500 mb-2">{group}</h3>
          <div className="space-y-1.5">
            {products.map((p) => {
              const active = p.id === productId;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onSelectProduct(p.id)}
                  aria-pressed={active}
                  className={`w-full text-left rounded-md px-3 py-2 border transition-colors ${
                    active
                      ? 'border-amber-500/70 bg-amber-500/10'
                      : 'border-slate-700 hover:border-slate-500 hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`font-medium ${active ? 'text-amber-300' : ''}`}>{p.name}</span>
                    <span className="text-[10px] uppercase text-slate-500">{p.scope === 'site' ? 'Single site' : 'Mosaic'}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 leading-snug">{p.description}</p>
                  <p className="text-[10px] text-slate-500 mt-1">
                    {[p.elevation && `${p.elevation} tilt`, p.resolution, `Source: ${p.source}`].filter(Boolean).join(' · ')}
                  </p>
                </button>
              );
            })}
          </div>
        </section>
      ))}

      {product.scope === 'site' && (
        <section className="px-4 py-3 border-b border-slate-800">
          <label htmlFor="radar-station" className="block text-[11px] uppercase tracking-wider text-slate-500 mb-2">
            Radar station
          </label>
          <div className="flex gap-2">
            <select
              id="radar-station"
              value={station?.id || ''}
              onChange={(e) => onSelectStation(e.target.value)}
              className="flex-1 min-w-0 rounded-md bg-slate-800 border border-slate-700 px-2 py-2 text-slate-100 focus:outline-none focus:border-amber-500"
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
              className="shrink-0 rounded-md border border-slate-700 px-2.5 hover:bg-slate-800"
            >
              <Crosshair className="w-4 h-4" />
              <span className="sr-only">Nearest radar to map center</span>
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-1.5">Tip: tap any radar dot on the map.</p>
        </section>
      )}

      <section className="px-4 py-3">
        <label htmlFor="radar-opacity" className="flex justify-between text-[11px] uppercase tracking-wider text-slate-500 mb-2">
          <span>Radar opacity</span>
          <span className="tabular-nums text-slate-300">{Math.round(opacity * 100)}%</span>
        </label>
        <input
          id="radar-opacity"
          type="range"
          min="0.1"
          max="1"
          step="0.05"
          value={opacity}
          onChange={(e) => onOpacity(Number(e.target.value))}
          className="w-full accent-amber-500"
        />
      </section>

      <p className="px-4 pb-3 text-[11px] text-slate-500 leading-snug">
        More dual-polarization and storm products will appear here as they are added.
      </p>
    </div>
  );
}
