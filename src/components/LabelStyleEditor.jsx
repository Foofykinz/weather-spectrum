import React, { useState } from 'react';
import { Bold, Italic, CaseUpper, AlignLeft, AlignCenter, AlignRight, ChevronDown } from 'lucide-react';
import { LABEL_FONTS, LABEL_PRESETS, SWATCHES, labelStyle } from '../posts/marks';

// Everything about one label's look: quick looks, text, background, border,
// effects and placement. mark: the selected label; onStyle(patch) changes
// mark.style; onMark(patch) changes the mark itself (color = border color, scale = size).

const chip = (on) =>
  `flex items-center justify-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold ${
    on ? 'border-sky-400/70 bg-sky-400/15 text-sky-200' : 'border-slate-700/80 text-slate-300 hover:bg-slate-800'
  }`;
const head = 'text-[11px] font-semibold uppercase tracking-wide text-slate-500';

export function ColorRow({ value, onChange, label }) {
  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label={label}>
      {SWATCHES.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`${label} ${c}`}
          onClick={() => onChange(c)}
          className={`h-5 w-5 rounded-full border-2 ${value?.toLowerCase() === c ? 'border-sky-300' : 'border-slate-700'}`}
          style={{ background: c }}
        />
      ))}
      <label className="relative h-5 w-5 cursor-pointer overflow-hidden rounded-full border-2 border-slate-700" title="Any color" style={{ background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }}>
        <input type="color" value={value || '#ffffff'} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label={`${label}: any color`} />
      </label>
    </div>
  );
}

export function Slider({ label, value, min, max, step, onChange, format = (v) => v }) {
  return (
    <label className="flex items-center gap-2 text-xs text-slate-400">
      <span className="w-16 shrink-0">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="min-w-0 flex-1 accent-sky-400" />
      <span className="w-10 shrink-0 text-right tabular-nums text-slate-300">{format(value)}</span>
    </label>
  );
}

// A group of options that opens and closes (one open at a time, so the list
// stays short and the picture stays in view).
export function Section({ id, title, open, setOpen, extra, children }) {
  const on = open === id;
  return (
    <div className="rounded-md border border-slate-800">
      <div className="flex items-center gap-2 pr-2">
        <button type="button" className="flex flex-1 items-center gap-1.5 px-2.5 py-2 text-left text-xs font-semibold text-slate-300 hover:text-slate-100" onClick={() => setOpen(on ? null : id)} aria-expanded={on}>
          <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform ${on ? '' : '-rotate-90'}`} />
          {title}
        </button>
        {extra}
      </div>
      {on && <div className="space-y-1.5 px-2.5 pb-2.5">{children}</div>}
    </div>
  );
}

export default function LabelStyleEditor({ mark, onStyle, onMark, onFont }) {
  const st = labelStyle(mark);
  const [open, setOpen] = useState('text');
  const pct = (v) => `${Math.round(v * 100)}%`;
  return (
    <div className="space-y-1.5">
      <div className="pb-1">
        <div className={`${head} mb-1`}>Quick looks</div>
        <div className="flex flex-wrap gap-1">
          {LABEL_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={chip(false)}
              onClick={() => {
                onStyle({ ...Object.fromEntries(Object.keys(st).map((k) => [k, undefined])), fontId: st.fontId, ...p.style }, true);
                if (p.color) onMark({ color: p.color });
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <Section id="text" title="Text" open={open} setOpen={setOpen}>
        <select
          value={st.fontId}
          onChange={(e) => {
            onStyle({ fontId: e.target.value });
            onFont?.(e.target.value);
          }}
          aria-label="Label font"
          className="w-full rounded-md border border-slate-700/80 bg-slate-950 px-2 py-1 text-xs text-slate-100"
        >
          {LABEL_FONTS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
        <div className="flex flex-wrap gap-1">
          <button type="button" className={chip(st.weight >= 700)} onClick={() => onStyle({ weight: st.weight === 400 ? 700 : st.weight === 700 ? 900 : 400 })} title="Bold: regular, bold, extra bold" aria-label="Bold">
            <Bold className="h-3.5 w-3.5" />
            {st.weight === 900 ? '+' : ''}
          </button>
          <button type="button" className={chip(st.italic)} onClick={() => onStyle({ italic: !st.italic })} aria-label="Italic" aria-pressed={st.italic}>
            <Italic className="h-3.5 w-3.5" />
          </button>
          <button type="button" className={chip(st.caps)} onClick={() => onStyle({ caps: !st.caps })} aria-label="All caps" aria-pressed={st.caps}>
            <CaseUpper className="h-3.5 w-3.5" />
          </button>
          <span className="mx-1 w-px bg-slate-700" />
          {[
            ['left', AlignLeft],
            ['center', AlignCenter],
            ['right', AlignRight],
          ].map(([a, Icon]) => (
            <button key={a} type="button" className={chip(st.align === a)} onClick={() => onStyle({ align: a })} aria-label={`Align ${a}`} aria-pressed={st.align === a}>
              <Icon className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
        <Slider label="Size" value={mark.scale || 1} min={0.4} max={3} step={0.05} onChange={(v) => onMark({ scale: v })} format={pct} />
        <Slider label="Spacing" value={st.spacing} min={-0.05} max={0.4} step={0.01} onChange={(v) => onStyle({ spacing: v })} format={(v) => v.toFixed(2)} />
        <div className="text-xs text-slate-400">Color</div>
        <ColorRow value={st.fg} onChange={(c) => onStyle({ fg: c })} label="Text color" />
      </Section>

      <Section id="bg" title="Background" open={open} setOpen={setOpen}>
        <div className="flex flex-wrap gap-1">
          {[
            ['none', 'None'],
            ['box', 'Box'],
            ['pill', 'Pill'],
            ['highlight', 'Highlight'],
          ].map(([v, t]) => (
            <button key={v} type="button" className={chip(st.bg === v)} onClick={() => onStyle({ bg: v })}>
              {t}
            </button>
          ))}
        </div>
        {st.bg !== 'none' && (
          <>
            <ColorRow value={st.bgColor} onChange={(c) => onStyle({ bgColor: c })} label="Background color" />
            <Slider label="Opacity" value={st.bgOpacity} min={0.05} max={1} step={0.01} onChange={(v) => onStyle({ bgOpacity: v })} format={pct} />
            {st.bg !== 'pill' && <Slider label="Corners" value={st.radius} min={0} max={1} step={0.05} onChange={(v) => onStyle({ radius: v })} format={pct} />}
          </>
        )}
        <Slider label="Padding" value={st.pad} min={0.3} max={2.5} step={0.05} onChange={(v) => onStyle({ pad: v })} format={pct} />
      </Section>

      <Section
        id="border"
        title="Border"
        open={open}
        setOpen={setOpen}
        extra={
          <button type="button" className={chip(st.border)} onClick={() => onStyle({ border: !st.border })} aria-pressed={st.border}>
            {st.border ? 'On' : 'Off'}
          </button>
        }
      >
        {st.border && (
          <>
            <ColorRow value={mark.color} onChange={(c) => onMark({ color: c })} label="Border color" />
            <Slider label="Thickness" value={st.borderWidth} min={0.5} max={10} step={0.5} onChange={(v) => onStyle({ borderWidth: v })} />
          </>
        )}
      </Section>

      <Section id="effect" title="Effect" open={open} setOpen={setOpen}>
        <div className="flex flex-wrap gap-1">
          {[
            ['none', 'None'],
            ['shadow', 'Shadow'],
            ['outline', 'Outline'],
            ['glow', 'Glow'],
          ].map(([v, t]) => (
            <button key={v} type="button" className={chip(st.effect === v)} onClick={() => onStyle({ effect: v })}>
              {t}
            </button>
          ))}
        </div>
        {st.effect !== 'none' && <ColorRow value={st.effectColor} onChange={(c) => onStyle({ effectColor: c })} label="Effect color" />}
      </Section>

      <Section id="place" title="Rotate and opacity" open={open} setOpen={setOpen}>
        <Slider label="Rotate" value={st.rotate} min={-45} max={45} step={1} onChange={(v) => onStyle({ rotate: v })} format={(v) => `${v}°`} />
        <Slider label="Opacity" value={st.opacity} min={0.1} max={1} step={0.01} onChange={(v) => onStyle({ opacity: v })} format={pct} />
      </Section>
    </div>
  );
}
