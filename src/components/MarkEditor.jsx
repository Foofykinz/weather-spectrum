import React, { useEffect, useRef, useState } from 'react';
import { MousePointer2, Type, MoveUpRight, Circle, Image as ImageIcon, Trash2 } from 'lucide-react';
import { MARK_COLORS, hitMark, markBounds } from '../posts/marks';

// Add labels, arrows, circles and a logo stamp on the post preview, and drag
// them around. view: the preview's makeView() result (null while it isn't ready).
// Returns { marks, panel, overlay, canvasProps }.
export function useMarkEditor({ canvasRef, view, font, logoImg }) {
  const [marks, setMarks] = useState([]);
  const [tool, setTool] = useState('select');
  const [selId, setSelId] = useState(null);
  const [color, setColor] = useState(MARK_COLORS[1]);
  const drag = useRef(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const opts = { font, logoImg };
  const sel = marks.find((m) => m.id === selId) || null;
  const update = (id, patch) => setMarks((ms) => ms.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  const remove = (id) => {
    setMarks((ms) => ms.filter((m) => m.id !== id));
    setSelId(null);
  };

  useEffect(() => {
    if (!logoImg) setMarks((ms) => (ms.some((m) => m.kind === 'logo') ? ms.filter((m) => m.kind !== 'logo') : ms));
  }, [logoImg]);

  // Delete / Backspace removes the selected mark (not while typing).
  useEffect(() => {
    if (!selId) return undefined;
    const onKey = (e) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) {
        e.preventDefault();
        remove(selId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selId]);

  const point = (e) => {
    const c = canvasRef.current;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * c.width) / r.width, y: ((e.clientY - r.top) * c.height) / r.height };
  };

  const onPointerDown = (e) => {
    const v = viewRef.current;
    const c = canvasRef.current;
    if (!v || !c) return;
    const p = point(e);
    const ll = v.toLatLng(p.x, p.y);
    const id = `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    if (tool === 'select') {
      const hit = hitMark(c, marks, v, p.x, p.y, opts);
      setSelId(hit?.id || null);
      if (!hit) return;
      const m = marks.find((x) => x.id === hit.id);
      drag.current = { id: hit.id, part: hit.part, start: p, a: v.toCanvas(m.a), b: m.b ? v.toCanvas(m.b) : null };
    } else if (tool === 'label' || tool === 'logo') {
      setMarks((ms) => [...ms, { id, kind: tool, a: ll, text: tool === 'label' ? 'Label' : undefined, color, scale: 1 }]);
      setSelId(id);
      setTool('select');
      return;
    } else {
      setMarks((ms) => [...ms, { id, kind: tool, a: ll, b: ll, color, scale: 1 }]);
      setSelId(id);
      drag.current = { id, part: 'b', start: p, created: tool };
    }
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    const d = drag.current;
    const v = viewRef.current;
    if (!d || !v) return;
    const p = point(e);
    if (d.part === 'b') return update(d.id, { b: v.toLatLng(p.x, p.y) });
    const dx = p.x - d.start.x;
    const dy = p.y - d.start.y;
    return update(d.id, { a: v.toLatLng(d.a.x + dx, d.a.y + dy), ...(d.b ? { b: v.toLatLng(d.b.x + dx, d.b.y + dy) } : {}) });
  };

  const onPointerUp = (e) => {
    const d = drag.current;
    drag.current = null;
    const v = viewRef.current;
    const c = canvasRef.current;
    if (!d?.created || !v || !c) return;
    // A tap instead of a drag: give it a starting size.
    const p = point(e);
    if (Math.hypot(p.x - d.start.x, p.y - d.start.y) < 20) {
      const u = c.width / 1080;
      const end = d.created === 'arrow' ? { x: d.start.x + 150 * u, y: d.start.y - 110 * u } : { x: d.start.x + 80 * u, y: d.start.y };
      update(d.id, { b: v.toLatLng(end.x, end.y) });
    }
    setTool('select');
  };

  const chip = (on) =>
    `flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs font-semibold ${
      on ? 'border-sky-400/70 bg-sky-400/15 text-sky-200' : 'border-slate-700/80 text-slate-300 hover:bg-slate-800'
    }`;
  const tools = [
    ['select', 'Move', MousePointer2],
    ['label', 'Label', Type],
    ['arrow', 'Arrow', MoveUpRight],
    ['circle', 'Circle', Circle],
    ...(logoImg ? [['logo', 'Logo', ImageIcon]] : []),
  ];
  const hint = {
    select: marks.length ? 'Drag a mark to move it. Drag the end of an arrow or the edge of a circle to change it.' : 'Pick Label, Arrow or Circle, then tap the picture.',
    label: 'Tap the picture where the label goes.',
    arrow: 'Drag on the picture from the start to the tip of the arrow.',
    circle: 'Drag from the center outward.',
    logo: 'Tap the picture where your logo goes.',
  }[tool];
  const setColorAll = (c) => {
    setColor(c);
    if (sel) update(sel.id, { color: c });
  };

  const panel = (
    <div className="rounded-lg border border-slate-700/80 p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Labels and arrows</span>
        {marks.length > 0 && (
          <button
            type="button"
            className="text-xs text-sky-300 hover:text-sky-200"
            onClick={() => {
              setMarks([]);
              setSelId(null);
            }}
          >
            Clear all
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {tools.map(([id, text, Icon]) => (
          <button key={id} type="button" className={chip(tool === id)} onClick={() => setTool(id)} aria-pressed={tool === id}>
            <Icon className="h-3.5 w-3.5" /> {text}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Color">
        {MARK_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Color ${c}`}
            onClick={() => setColorAll(c)}
            className={`h-6 w-6 rounded-full border-2 ${(sel?.color || color) === c ? 'border-sky-300' : 'border-slate-700'}`}
            style={{ background: c }}
          />
        ))}
      </div>
      {sel && (
        <div className="space-y-2 border-t border-slate-800 pt-2.5">
          {sel.kind === 'label' && (
            <textarea
              autoFocus
              rows={2}
              maxLength={80}
              value={sel.text}
              onChange={(e) => update(sel.id, { text: e.target.value })}
              aria-label="Label text"
              className="w-full resize-none rounded-md border border-slate-700/80 bg-slate-950 px-2.5 py-1.5 text-sm text-slate-100"
            />
          )}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-400">Size</span>
            {[
              [0.7, 'S'],
              [1, 'M'],
              [1.4, 'L'],
            ].map(([k, t]) => (
              <button key={t} type="button" className={chip((sel.scale || 1) === k)} onClick={() => update(sel.id, { scale: k })}>
                {t}
              </button>
            ))}
            <button type="button" onClick={() => remove(sel.id)} className={`${chip(false)} ml-auto`}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          </div>
        </div>
      )}
      <p className="text-[11px] leading-snug text-slate-500">{hint} Marks stay on the same spot of the map in every size.</p>
    </div>
  );

  let overlay = null;
  const c = canvasRef.current;
  if (sel && view && c?.width) {
    const r = markBounds(c, sel, view, opts);
    const pct = (v, total) => `${(v / total) * 100}%`;
    overlay = (
      <div
        aria-hidden
        className="pointer-events-none absolute rounded border-2 border-dashed border-sky-300/90"
        style={{ left: pct(r.x - 6, c.width), top: pct(r.y - 6, c.height), width: pct(r.w + 12, c.width), height: pct(r.h + 12, c.height) }}
      />
    );
  }

  const canvasProps = {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: () => (drag.current = null),
    style: { touchAction: tool !== 'select' || marks.length ? 'none' : 'auto', cursor: tool === 'select' ? (marks.length ? 'move' : 'default') : 'crosshair' },
  };

  return { marks, panel, overlay, canvasProps };
}
