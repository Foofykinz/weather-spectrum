import React, { useEffect, useRef, useState } from 'react';
import { MousePointer2, Type, MoveUpRight, Circle, Image as ImageIcon, Trash2, Undo2, Redo2, Copy, BringToFront, SendToBack } from 'lucide-react';
import { MARK_COLORS, ARROW_STYLES, hitMark, markBounds, loadLabelFont } from '../posts/marks';
import LabelStyleEditor, { ColorRow, Slider } from './LabelStyleEditor';

// Add labels, arrows, circles and a logo stamp on the post preview, drag them
// around and style them. Undo / redo (Ctrl+Z, Ctrl+Shift+Z), duplicate
// (Ctrl+D), arrow keys nudge (Shift = farther), Delete removes.
// view: the preview's makeView() result (null while it isn't ready).
// boxes (optional): the picture's own boxes, which can be dragged too:
// { rects: ref to { id: {x,y,w,h,s} } in canvas pixels, set(id, {px,py,s}) }
// with px/py the top-left corner as fractions of the picture size and s the
// box's scale. Drag a box to move it, or its corner handle to resize it.
// onTap(kind, detail) (optional): what a tap with the Move tool landed on:
// 'mark' (a label / arrow / circle / logo, also right after adding one),
// 'box' (detail: the box id) or 'empty' (detail: the canvas point).
// Returns { marks, panel, overlay, canvasProps, setAll(marks) }.
export function useMarkEditor({ canvasRef, view, font, logoImg, boxes, onTap }) {
  const [marks, setMarksRaw] = useState([]);
  const [tool, setTool] = useState('select');
  const [selId, setSelId] = useState(null);
  const [color, setColor] = useState(MARK_COLORS[1]);
  const [hover, setHover] = useState(false); // pointer over the picture: show the resize corners
  const drag = useRef(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const opts = { font, logoImg };
  const sel = marks.find((m) => m.id === selId) || null;

  // ---- history. Changes with the same key within a moment (a drag, a slider)
  // become one undo step.
  const marksRef = useRef(marks);
  marksRef.current = marks;
  const hist = useRef({ past: [], future: [], key: null, t: 0 });
  const [, setHistTick] = useState(0);
  const setMarks = (next, key = null) => {
    const h = hist.current;
    const now = Date.now();
    if (!(key && key === h.key && now - h.t < 900)) {
      h.past.push(marksRef.current);
      if (h.past.length > 100) h.past.shift();
      h.future = [];
    }
    h.key = key;
    h.t = now;
    setMarksRaw(next);
    setHistTick((t) => t + 1);
  };
  const undo = () => {
    const h = hist.current;
    if (!h.past.length) return;
    h.future.push(marksRef.current);
    const prev = h.past.pop();
    h.key = null;
    setMarksRaw(prev);
    if (selId && !prev.some((m) => m.id === selId)) setSelId(null);
    setHistTick((t) => t + 1);
  };
  const redo = () => {
    const h = hist.current;
    if (!h.future.length) return;
    h.past.push(marksRef.current);
    const next = h.future.pop();
    h.key = null;
    setMarksRaw(next);
    setHistTick((t) => t + 1);
  };

  // The look of the last styled label, for the next new one (like Canva).
  // Size isn't carried over: new labels start at the normal size.
  const lastLabel = useRef({ style: undefined, color: undefined, scale: 1 });
  const lastArrow = useRef(undefined); // same for arrows (style, bend, dashes)
  const update = (id, patch, key = `u-${id}-${Object.keys(patch).join()}`) => {
    setMarks((ms) => ms.map((m) => (m.id === id ? { ...m, ...patch } : m)), key);
  };
  const updateStyle = (id, patch, replace = false) => {
    setMarks(
      (ms) =>
        ms.map((m) => {
          if (m.id !== id) return m;
          const style = Object.fromEntries(Object.entries(replace ? patch : { ...(m.style || {}), ...patch }).filter(([, v]) => v !== undefined));
          if (m.kind === 'label') lastLabel.current = { style, color: m.color, scale: m.scale || 1 };
          if (m.kind === 'arrow') lastArrow.current = style;
          return { ...m, style };
        }),
      `s-${id}-${Object.keys(patch).join()}`
    );
  };
  const updateMark = (id, patch) => {
    const m = marksRef.current.find((x) => x.id === id);
    if (m?.kind === 'label') lastLabel.current = { ...lastLabel.current, ...('color' in patch ? { color: patch.color } : {}), ...('scale' in patch ? { scale: patch.scale } : {}) };
    update(id, patch);
  };
  const remove = (id) => {
    setMarks((ms) => ms.filter((m) => m.id !== id));
    setSelId(null);
  };
  const newId = () => `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const duplicate = (id) => {
    const m = marksRef.current.find((x) => x.id === id);
    const v = viewRef.current;
    if (!m || !v) return;
    const shift = (ll) => {
      const p = v.toCanvas(ll);
      const d = 30 * ((canvasRef.current?.width || 1080) / 1080);
      return v.toLatLng(p.x + d, p.y + d);
    };
    const copy = { ...m, id: newId(), a: shift(m.a), ...(m.b ? { b: shift(m.b) } : {}) };
    setMarks((ms) => [...ms, copy]);
    setSelId(copy.id);
  };
  const reorder = (id, toFront) =>
    setMarks((ms) => {
      const m = ms.find((x) => x.id === id);
      const rest = ms.filter((x) => x.id !== id);
      return toFront ? [...rest, m] : [m, ...rest];
    });
  const nudge = (id, dx, dy) => {
    const m = marksRef.current.find((x) => x.id === id);
    const v = viewRef.current;
    if (!m || !v) return;
    const mv = (ll) => {
      const p = v.toCanvas(ll);
      return v.toLatLng(p.x + dx, p.y + dy);
    };
    update(id, { a: mv(m.a), ...(m.b ? { b: mv(m.b) } : {}) }, `n-${id}`);
  };
  // Redraw once a picked font has arrived.
  const [, setFontTick] = useState(0);
  const pickFont = (fid) => loadLabelFont(fid).then(() => setFontTick((t) => t + 1));
  useEffect(() => {
    for (const m of marks) if (m.style?.fontId) loadLabelFont(m.style.fontId).then(() => setFontTick((t) => t + 1));
  }, [marks.map((m) => m.style?.fontId || '').join()]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!logoImg) setMarksRaw((ms) => (ms.some((m) => m.kind === 'logo') ? ms.filter((m) => m.kind !== 'logo') : ms));
  }, [logoImg]);

  // Keyboard (not while typing in a box).
  useEffect(() => {
    const onKey = (e) => {
      if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      } else if (selId && mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicate(selId);
      } else if (selId && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        remove(selId);
      } else if (selId && e.key.startsWith('Arrow')) {
        e.preventDefault();
        const d = (e.shiftKey ? 20 : 2) * ((canvasRef.current?.width || 1080) / 1080);
        nudge(selId, e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0, e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const point = (e) => {
    const c = canvasRef.current;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * c.width) / r.width, y: ((e.clientY - r.top) * c.height) / r.height };
  };

  // The box under a point, and whether it's on the box's resize corner.
  const boxAt = (p) => {
    const rects = boxes?.rects.current || {};
    const c = canvasRef.current;
    const reach = Math.max(22, (34 * c.width) / 1080);
    const ids = Object.keys(rects).reverse();
    for (const id of ids) {
      const b = rects[id];
      if (Math.abs(p.x - (b.x + b.w)) <= reach && Math.abs(p.y - (b.y + b.h)) <= reach) return { id, corner: true };
    }
    const id = ids.find((k) => { const b = rects[k]; return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h; });
    return id ? { id, corner: false } : null;
  };

  const onPointerDown = (e) => {
    const v = viewRef.current;
    const c = canvasRef.current;
    if (!v || !c) return;
    const p = point(e);
    const ll = v.toLatLng(p.x, p.y);
    const id = newId();
    if (tool === 'select') {
      const hit = hitMark(c, marks, v, p.x, p.y, opts);
      setSelId(hit?.id || null);
      if (!hit) {
        const hit2 = boxAt(p);
        onTap?.(hit2 ? 'box' : 'empty', hit2 ? hit2.id : p);
        if (!hit2) return;
        drag.current = { box: hit2.id, corner: hit2.corner, start: p, base: { ...boxes.rects.current[hit2.id] } };
        e.currentTarget.setPointerCapture?.(e.pointerId);
        return;
      }
      onTap?.('mark', hit.id);
      const m = marks.find((x) => x.id === hit.id);
      drag.current = { id: hit.id, part: hit.part, start: p, a: v.toCanvas(m.a), b: m.b ? v.toCanvas(m.b) : null, key: `d-${hit.id}-${Date.now()}` };
    } else if (tool === 'label') {
      const last = lastLabel.current;
      setMarks((ms) => [...ms, { id, kind: 'label', a: ll, text: 'Label', color: last.color || color, scale: 1, ...(last.style ? { style: last.style } : {}) }]);
      setSelId(id);
      setTool('select');
      onTap?.('mark', id);
      return;
    } else if (tool === 'logo') {
      setMarks((ms) => [...ms, { id, kind: 'logo', a: ll, color, scale: 1 }]);
      setSelId(id);
      setTool('select');
      return;
    } else {
      setMarks((ms) => [...ms, { id, kind: tool, a: ll, b: ll, color, scale: 1, ...(tool === 'arrow' && lastArrow.current ? { style: lastArrow.current } : {}) }], `c-${id}`);
      setSelId(id);
      onTap?.('mark', id);
      drag.current = { id, part: 'b', start: p, created: tool, key: `c-${id}` };
    }
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    const d = drag.current;
    const v = viewRef.current;
    const c = canvasRef.current;
    if (!d && boxes && tool === 'select' && c && e.pointerType === 'mouse') {
      const h = boxAt(point(e));
      e.currentTarget.style.cursor = h?.corner ? 'nwse-resize' : h || marks.length ? 'move' : 'default';
    }
    if (!d || !v) return;
    const p = point(e);
    if (d.box) {
      const b = d.base;
      const dx = p.x - d.start.x;
      const dy = p.y - d.start.y;
      if (!d.corner) return boxes.set(d.box, { px: (b.x + dx) / c.width, py: (b.y + dy) / c.height, s: b.s });
      const k = Math.max(0.2, ((b.w + dx) / b.w + (b.h + dy) / b.h) / 2);
      return boxes.set(d.box, { px: b.x / c.width, py: b.y / c.height, s: b.s * k });
    }
    if (d.part === 'b') return update(d.id, { b: v.toLatLng(p.x, p.y) }, d.key);
    const dx = p.x - d.start.x;
    const dy = p.y - d.start.y;
    return update(d.id, { a: v.toLatLng(d.a.x + dx, d.a.y + dy), ...(d.b ? { b: v.toLatLng(d.b.x + dx, d.b.y + dy) } : {}) }, d.key);
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
      update(d.id, { b: v.toLatLng(end.x, end.y) }, d.key);
    }
    setTool('select');
  };

  const chip = (on) =>
    `flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs font-semibold ${
      on ? 'border-sky-400/70 bg-sky-400/15 text-sky-200' : 'border-slate-700/80 text-slate-300 hover:bg-slate-800'
    }`;
  const iconBtn = 'flex items-center gap-1 rounded-md border border-slate-700/80 px-2 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-35 disabled:hover:bg-transparent';
  const tools = [
    ['select', 'Move', MousePointer2],
    ['label', 'Label', Type],
    ['arrow', 'Arrow', MoveUpRight],
    ['circle', 'Circle', Circle],
    ...(logoImg ? [['logo', 'Logo', ImageIcon]] : []),
  ];
  const hint = {
    select: boxes ? 'Drag a box on the picture to move it, or its corner handle to resize it. Pick Label, Arrow or Circle to add marks.' : marks.length ? 'Drag a mark to move it. Drag the end of an arrow or the edge of a circle to change it.' : 'Pick Label, Arrow or Circle, then tap the picture.',
    label: 'Tap the picture where the label goes.',
    arrow: 'Drag on the picture from the start to the tip of the arrow.',
    circle: 'Drag from the center outward.',
    logo: 'Tap the picture where your logo goes.',
  }[tool];
  const setColorAll = (c) => {
    setColor(c);
    if (sel) updateMark(sel.id, { color: c });
  };
  const h = hist.current;

  const panel = (
    <div className="rounded-lg border border-slate-700/80 p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Labels and arrows</span>
        <div className="flex items-center gap-1">
          <button type="button" className={iconBtn} onClick={undo} disabled={!h.past.length} title="Undo (Ctrl+Z)" aria-label="Undo">
            <Undo2 className="h-3.5 w-3.5" />
          </button>
          <button type="button" className={iconBtn} onClick={redo} disabled={!h.future.length} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">
            <Redo2 className="h-3.5 w-3.5" />
          </button>
          {marks.length > 0 && (
            <button
              type="button"
              className="ml-1 text-xs text-sky-300 hover:text-sky-200"
              onClick={() => {
                setMarks([]);
                setSelId(null);
              }}
            >
              Clear all
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {tools.map(([id, text, Icon]) => (
          <button key={id} type="button" className={chip(tool === id)} onClick={() => setTool(id)} aria-pressed={tool === id}>
            <Icon className="h-3.5 w-3.5" /> {text}
          </button>
        ))}
      </div>
      {!(sel?.kind === 'label') && (
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
          <label className="relative h-6 w-6 cursor-pointer overflow-hidden rounded-full border-2 border-slate-700" title="Any color" style={{ background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }}>
            <input type="color" value={sel?.color || color} onChange={(e) => setColorAll(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label="Any color" />
          </label>
        </div>
      )}
      {sel && (
        <div className="space-y-2.5 border-t border-slate-800 pt-2.5">
          {sel.kind === 'label' && (
            <textarea
              autoFocus
              rows={2}
              maxLength={160}
              value={sel.text}
              onChange={(e) => update(sel.id, { text: e.target.value })}
              aria-label="Label text"
              placeholder="Type your label (Enter for a new line)"
              className="w-full resize-y rounded-md border border-slate-700/80 bg-slate-950 px-2.5 py-1.5 text-sm text-slate-100"
            />
          )}
          {sel.kind === 'label' ? (
            <LabelStyleEditor mark={sel} onStyle={(patch, replace) => updateStyle(sel.id, patch, replace)} onMark={(patch) => updateMark(sel.id, patch)} onFont={pickFont} />
          ) : (
            <div className="space-y-1.5">
              <Slider label="Size" value={sel.scale || 1} min={0.4} max={3} step={0.05} onChange={(v) => update(sel.id, { scale: v })} format={(v) => `${Math.round(v * 100)}%`} />
              {sel.kind === 'arrow' && (
                <>
                  <div className="flex flex-wrap gap-1" role="group" aria-label="Arrow style">
                    {ARROW_STYLES.map(([v, t]) => (
                      <button key={v} type="button" className={chip((sel.style?.arrow || 'classic') === v)} onClick={() => updateStyle(sel.id, { arrow: v })}>
                        {t}
                      </button>
                    ))}
                  </div>
                  {sel.style?.arrow === 'curved' && (
                    <Slider label="Bend" value={sel.style?.bend ?? 0.35} min={-1} max={1} step={0.05} onChange={(v) => updateStyle(sel.id, { bend: v })} format={(v) => (v > 0 ? `${Math.round(v * 100)}` : `${Math.round(v * 100)}`)} />
                  )}
                </>
              )}
              {(sel.kind === 'arrow' || sel.kind === 'circle') && sel.style?.arrow !== 'block' && (
                <div className="flex flex-wrap gap-1">
                  <button type="button" className={chip(!!sel.style?.dash)} onClick={() => updateStyle(sel.id, { dash: !sel.style?.dash })} aria-pressed={!!sel.style?.dash}>
                    Dashed
                  </button>
                  {sel.kind === 'circle' && (
                    <button type="button" className={chip(!!sel.style?.fill)} onClick={() => updateStyle(sel.id, { fill: !sel.style?.fill })} aria-pressed={!!sel.style?.fill}>
                      Light fill
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1">
            <button type="button" className={iconBtn} onClick={() => duplicate(sel.id)} title="Duplicate (Ctrl+D)">
              <Copy className="h-3.5 w-3.5" /> Duplicate
            </button>
            <button type="button" className={iconBtn} onClick={() => reorder(sel.id, true)} title="Bring to front">
              <BringToFront className="h-3.5 w-3.5" />
            </button>
            <button type="button" className={iconBtn} onClick={() => reorder(sel.id, false)} title="Send to back">
              <SendToBack className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={() => remove(sel.id)} className={`${iconBtn} ml-auto`}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          </div>
        </div>
      )}
      <p className="text-[11px] leading-snug text-slate-500">
        {hint} Marks stay on the same spot of the map in every size. Arrow keys nudge the selected mark; Ctrl+Z undoes.
      </p>
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

  // Resize corners on the picture's boxes, while the pointer is over the
  // picture or a box is being dragged (on screen only, never saved).
  if (boxes && c?.width && tool === 'select' && (hover || drag.current?.box)) {
    const pct = (v, total) => `${(v / total) * 100}%`;
    const rects = boxes.rects.current || {};
    overlay = (
      <>
        {overlay}
        {Object.entries(rects).map(([id, b]) => (
          <div
            key={id}
            aria-hidden
            className="pointer-events-none absolute h-4 w-4 -translate-x-full -translate-y-full rounded-br-[5px] border-b-[3px] border-r-[3px] border-sky-300"
            style={{ left: pct(b.x + b.w, c.width), top: pct(b.y + b.h, c.height), filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.9))' }}
          />
        ))}
      </>
    );
  }

  const canvasProps = {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: () => (drag.current = null),
    onPointerEnter: () => setHover(true),
    onPointerLeave: () => setHover(false),
    style: { touchAction: tool !== 'select' || marks.length || boxes ? 'none' : 'auto', cursor: tool === 'select' ? (marks.length || boxes ? 'move' : 'default') : 'crosshair' },
  };

  // Replace every mark at once (a restored draft or a template); undoable.
  const setAll = (list) => {
    setMarks(Array.isArray(list) ? list : []);
    setSelId(null);
  };

  return { marks, panel, overlay, canvasProps, setAll };
}

export { ColorRow };
