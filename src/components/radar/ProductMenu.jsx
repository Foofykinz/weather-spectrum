import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight } from 'lucide-react';
import { LEVEL3_TILTS, tiltSourceOf, selectedTiltFor, productForTilt } from '../../radar/products';
import { listLevel3Tilts } from '../../radar/providers/level3';

// Last tilt list seen per radar + product, so the Tilt box can say "Tilt 2"
// without a new request. Only filled from real file listings.
const seen = new Map();

const POP_W = 176;

// Tilt pop-out menu. Lists only the tilts this radar has actually published
// in its latest volume, with the angle read from each file. Rendered into
// <body> so it isn't clipped by the scrolling product list.
function TiltPopover({ anchor, station, source, selected, onPick, onClose }) {
  const key = station ? `${station.id}:${source.tiltLetter}` : null;
  const [state, setState] = useState(() => ({ status: key ? 'loading' : 'no-station', list: seen.get(key) || [] }));
  const ref = useRef(null);
  const [pos, setPos] = useState(null);

  useEffect(() => {
    if (!key) return undefined;
    const c = new AbortController();
    listLevel3Tilts(station, source.tiltLetter, LEVEL3_TILTS, c.signal)
      .then((list) => {
        seen.set(key, list);
        setState({ status: list.length ? 'ok' : 'empty', list });
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setState((s) => ({ ...s, status: 'error' }));
      });
    return () => c.abort();
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  // Place to the right of the Tilt box; below it when there's no room.
  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect();
    const h = ref.current?.offsetHeight || 200;
    let left = r.right + 6;
    let top = r.top;
    if (left + POP_W > window.innerWidth - 8) {
      left = Math.max(8, r.right - POP_W);
      top = r.bottom + 4;
    }
    top = Math.max(8, Math.min(top, window.innerHeight - h - 8));
    setPos({ left, top });
  }, [anchor, state]);

  // Close on outside press, Escape, resize, or when the list scrolls.
  useEffect(() => {
    const down = (e) => {
      if (!ref.current?.contains(e.target) && !anchor.contains(e.target)) onClose();
    };
    const key = (e) => e.key === 'Escape' && onClose();
    const scroll = (e) => {
      if (!ref.current?.contains(e.target)) onClose();
    };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('keydown', key);
    window.addEventListener('resize', onClose);
    document.addEventListener('scroll', scroll, true);
    return () => {
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('keydown', key);
      window.removeEventListener('resize', onClose);
      document.removeEventListener('scroll', scroll, true);
    };
  }, [anchor, onClose]);

  const list = state.list;
  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label="Elevation tilt"
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? 0, width: POP_W }}
      className="fixed z-[3000] rounded-lg border border-slate-700 bg-slate-900 shadow-2xl py-1 text-sm text-slate-200"
    >
      {state.status === 'no-station' && <p className="px-3 py-2 text-xs text-slate-400">Choose a radar first.</p>}
      {state.status === 'loading' && !list.length && <p className="px-3 py-2 text-xs text-slate-400">Checking available tilts…</p>}
      {state.status === 'empty' && <p className="px-3 py-2 text-xs text-slate-400">No tilts published right now.</p>}
      {state.status === 'error' && !list.length && <p className="px-3 py-2 text-xs text-red-300">Couldn&apos;t load tilts.</p>}
      {list.map((t, i) => {
        const active = t.tilt === selected;
        return (
          <button
            key={t.tilt}
            type="button"
            role="menuitemradio"
            aria-checked={active}
            onClick={() => onPick(t.tilt)}
            className={`flex w-full items-center justify-between px-3 py-1.5 text-left ${active ? 'bg-amber-500/15 text-amber-200' : 'hover:bg-slate-800'}`}
          >
            <span>Tilt {i + 1}</span>
            <span className="tabular-nums text-xs text-slate-400">{t.elevation.toFixed(1)}°</span>
          </button>
        );
      })}
    </div>,
    document.body
  );
}

// Grouped product list. Products with elevation tilts get a small "Tilt" box
// that opens the tilt menu. onPick(productId, tiltParam|null).
export default function ProductMenu({ groups, productId, tiltParam, station, onPick, showDetails = true }) {
  const [open, setOpen] = useState(null); // { id, anchor }

  return (
    <>
      {groups.map(([group, products]) => (
        <section key={group} className="px-2 pt-2 pb-1">
          <h3 className="px-1 text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">{group}</h3>
          <ul>
            {products.map((p) => {
              const sel = selectedTiltFor(p.id, productId, tiltParam);
              const active = sel !== null;
              const source = tiltSourceOf(p);
              const known = source && station ? seen.get(`${station.id}:${source.tiltLetter}`) : null;
              const idx = known && sel ? known.findIndex((t) => t.tilt === sel) : -1;
              const tiltLabel = active && idx > 0 ? `Tilt ${idx + 1}` : 'Tilt';
              const isOpen = open?.id === p.id;
              return (
                <li key={p.id} className={`rounded-md ${active ? 'bg-amber-500/10 ring-1 ring-inset ring-amber-500/60' : ''}`}>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => !active && onPick(p.id, null)}
                      aria-pressed={active}
                      className={`flex-1 min-w-0 text-left rounded-md px-2 py-1.5 ${active ? '' : 'hover:bg-slate-800'}`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className={`truncate ${active ? 'text-amber-300 font-medium' : 'text-slate-200'}`}>{p.name}</span>
                        {p.scope !== 'site' && <span className="shrink-0 text-[10px] uppercase text-slate-500">Mosaic</span>}
                      </span>
                    </button>
                    {source && (
                      <button
                        type="button"
                        aria-haspopup="menu"
                        aria-expanded={isOpen}
                        onClick={(e) => setOpen(isOpen ? null : { id: p.id, anchor: e.currentTarget })}
                        className={`mr-1 shrink-0 flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[11px] font-semibold ${
                          isOpen || (active && idx > 0)
                            ? 'border-amber-500/70 bg-amber-500/15 text-amber-200'
                            : 'border-slate-600 text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        {tiltLabel}
                        <ChevronRight className="w-3 h-3" aria-hidden />
                      </button>
                    )}
                  </div>
                  {active && showDetails && (
                    <p className="px-2 pb-1.5 text-xs text-slate-400 leading-snug">
                      {p.description}
                      <span className="block mt-1 text-[10px] text-slate-500">
                        {[p.resolution, `Source: ${p.source}`].filter(Boolean).join(' · ')}
                      </span>
                    </p>
                  )}
                  {isOpen && (
                    <TiltPopover
                      anchor={open.anchor}
                      station={station}
                      source={source}
                      selected={sel}
                      onClose={() => setOpen(null)}
                      onPick={(tilt) => {
                        setOpen(null);
                        const r = productForTilt(p.id, tilt);
                        onPick(r.product, r.tilt);
                      }}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}
