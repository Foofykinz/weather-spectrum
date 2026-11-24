import React, { useState } from 'react';
import { Bold, Italic, CaseUpper, AlignLeft, AlignCenter, AlignRight } from 'lucide-react';
import { LABEL_FONTS } from '../../posts/marks';
import { HEADER_DEFAULTS, HEADER_PRESETS, HEADER_TAGS, headerStyle } from '../../radar/postHeader';
import { ColorRow, Slider, Section } from '../LabelStyleEditor';

// Header options for the post (see radar/postHeader). value: the viewer's
// changes; onChange(next) replaces them. band: false for the Clean style
// (headline box; the layout options don't apply there). capsAuto: whether
// the style puts the headline in caps on its own.
const chip = (on) =>
  `flex items-center justify-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold ${
    on ? 'border-sky-400/70 bg-sky-400/15 text-sky-200' : 'border-slate-700/80 text-slate-300 hover:bg-slate-800'
  }`;
const head = 'text-[11px] font-semibold uppercase tracking-wide text-slate-500';
const pct = (v) => `${Math.round(v * 100)}%`;

export default function HeaderEditor({ value, onChange, onFont, band = true, capsAuto = false, hasLogo = false }) {
  const hd = headerStyle(value);
  const set = (patch) => onChange({ ...value, ...patch });
  const caps = hd.caps ?? capsAuto;
  const custom = Object.keys(value || {}).length > 0;
  const [open, setOpen] = useState('headline');
  const Choice = ({ options, k }) => (
    <div className="flex flex-wrap gap-1">
      {options.map(([v, t]) => (
        <button key={String(v)} type="button" className={chip(hd[k] === v)} onClick={() => set({ [k]: v })}>
          {t}
        </button>
      ))}
    </div>
  );
  return (
    <div className="space-y-1.5">
      <div className="pb-1">
        <div className="mb-1 flex items-center justify-between">
          <span className={head}>Quick looks</span>
          {custom && (
            <button type="button" className="text-xs text-sky-300 hover:text-sky-200" onClick={() => onChange({})}>
              Reset header
            </button>
          )}
        </div>
          <div className="flex flex-wrap gap-1">
            {HEADER_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={chip(false)}
                onClick={() => {
                  onChange({ ...p.hd });
                  if (p.hd.font) onFont?.(p.hd.font);
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <Section id="headline" title="Headline style" open={open} setOpen={setOpen}>
          <select
            value={hd.font}
            onChange={(e) => {
              set({ font: e.target.value });
              onFont?.(e.target.value);
            }}
            aria-label="Header font"
            className="w-full rounded-md border border-slate-700/80 bg-slate-950 px-2 py-1 text-xs text-slate-100"
          >
            {LABEL_FONTS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              className={chip(hd.weight != null)}
              onClick={() => set({ weight: hd.weight == null ? 400 : hd.weight === 400 ? 700 : hd.weight === 700 ? 900 : null })}
              title="Weight: automatic, regular, bold, extra bold"
              aria-label="Bold"
            >
              <Bold className="h-3.5 w-3.5" />
              <span className="text-[10px]">{hd.weight == null ? 'Auto' : hd.weight === 400 ? 'Reg' : hd.weight === 700 ? 'Bold' : 'Extra'}</span>
            </button>
            <button type="button" className={chip(hd.italic)} onClick={() => set({ italic: !hd.italic })} aria-label="Italic" aria-pressed={hd.italic}>
              <Italic className="h-3.5 w-3.5" />
            </button>
            <button type="button" className={chip(caps)} onClick={() => set({ caps: !caps })} aria-label="All caps" aria-pressed={caps}>
              <CaseUpper className="h-3.5 w-3.5" />
            </button>
            {band && (
              <>
                <span className="mx-1 w-px bg-slate-700" />
                {[
                  ['left', AlignLeft],
                  ['center', AlignCenter],
                  ['right', AlignRight],
                ].map(([a, Icon]) => (
                  <button key={a} type="button" className={chip(hd.align === a)} onClick={() => set({ align: a })} aria-label={`Align ${a}`} aria-pressed={hd.align === a}>
                    <Icon className="h-3.5 w-3.5" />
                  </button>
                ))}
              </>
            )}
          </div>
          <Slider label="Size" value={hd.size} min={0.5} max={1.6} step={0.05} onChange={(v) => set({ size: v })} format={pct} />
          <Slider label="Spacing" value={hd.spacing} min={-0.05} max={0.4} step={0.01} onChange={(v) => set({ spacing: v })} format={(v) => v.toFixed(2)} />
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Color</span>
            <button type="button" className={chip(!hd.color)} onClick={() => set({ color: '' })}>
              Auto
            </button>
          </div>
          <ColorRow value={hd.color} onChange={(c) => set({ color: c })} label="Headline color" />
          <div className="text-xs text-slate-400">Effect</div>
          <Choice k="effect" options={[['none', 'None'], ['shadow', 'Shadow'], ['outline', 'Outline'], ['glow', 'Glow']]} />
          {hd.effect !== 'none' && <ColorRow value={hd.effectColor} onChange={(c) => set({ effectColor: c })} label="Effect color" />}
        </Section>

        <Section
          id="sub"
          title="Second line"
          open={open}
          setOpen={setOpen}
          extra={
            <button type="button" className={chip(hd.sub)} onClick={() => set({ sub: !hd.sub })} aria-pressed={hd.sub}>
              {hd.sub ? 'Shown' : 'Hidden'}
            </button>
          }
        >
          {hd.sub && (
            <>
              <Slider label="Size" value={hd.subSize} min={0.6} max={1.6} step={0.05} onChange={(v) => set({ subSize: v })} format={pct} />
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Color</span>
                <button type="button" className={chip(!hd.subColor)} onClick={() => set({ subColor: '' })}>
                  Auto
                </button>
              </div>
              <ColorRow value={hd.subColor} onChange={(c) => set({ subColor: c })} label="Second line color" />
            </>
          )}
        </Section>

        <Section id="tag" title="Tag and icon" open={open} setOpen={setOpen}>
          <div className="flex flex-wrap gap-1">
            <button type="button" className={chip(!hd.tag)} onClick={() => set({ tag: '' })}>
              No tag
            </button>
            {HEADER_TAGS.map((t) => (
              <button key={t} type="button" className={chip(hd.tag === t)} onClick={() => set({ tag: t })}>
                {t}
              </button>
            ))}
          </div>
          <input
            value={hd.tag}
            maxLength={16}
            onChange={(e) => set({ tag: e.target.value })}
            placeholder="Or type your own tag"
            aria-label="Custom tag"
            className="w-full rounded-md border border-slate-700/80 bg-slate-950 px-2 py-1 text-xs text-slate-100"
          />
          {hd.tag && <ColorRow value={hd.tagColor} onChange={(c) => set({ tagColor: c })} label="Tag color" />}
          <button type="button" className={chip(hd.icon)} onClick={() => set({ icon: !hd.icon })} aria-pressed={hd.icon}>
            {hd.icon ? 'Alert icon: on' : 'Alert icon: off'}
          </button>
          <p className="text-[11px] text-slate-500">The icon matches the highlighted alert: tornado, storm, wind, flood, snow, or a radar dish when there's no alert.</p>
        </Section>

        <Section id="bg" title="Background" open={open} setOpen={setOpen}>
          <Choice k="bg" options={[['auto', 'Auto'], ['solid', 'Solid'], ['gradient', 'Gradient'], ['warning', 'Alert color'], ['glass', 'Glass']]} />
          {(hd.bg === 'solid' || hd.bg === 'gradient' || hd.bg === 'glass') && <ColorRow value={hd.bgColor} onChange={(c) => set({ bgColor: c })} label="Background color" />}
          {hd.bg === 'gradient' && (
            <>
              <ColorRow value={hd.bgColor2} onChange={(c) => set({ bgColor2: c })} label="Second gradient color" />
              <Choice k="gradDir" options={[['h', 'Left to right'], ['v', 'Top to bottom']]} />
            </>
          )}
          {hd.bg === 'glass' && <Slider label="Opacity" value={hd.bgOpacity} min={0} max={1} step={0.01} onChange={(v) => set({ bgOpacity: v })} format={pct} />}
          {hd.bg === 'glass' && band && <p className="text-[11px] text-slate-500">The map shows through the header.</p>}
        </Section>

        <Section id="accent" title="Accent stripe" open={open} setOpen={setOpen}>
          <Choice k="accent" options={[['auto', 'Auto'], ['off', 'Off'], ['color', 'Color'], ['stripes', 'Hazard stripes']]} />
          {hd.accent === 'color' && <ColorRow value={hd.accentColor} onChange={(c) => set({ accentColor: c })} label="Accent color" />}
          {(hd.accent === 'color' || hd.accent === 'stripes') && <Slider label="Thickness" value={hd.accentWidth} min={2} max={30} step={1} onChange={(v) => set({ accentWidth: v })} />}
        </Section>

        {band && (
          <Section id="layout" title="Position and size" open={open} setOpen={setOpen}>
            <Choice k="position" options={[['top', 'Top'], ['bottom', 'Bottom']]} />
            <Slider label="Height" value={hd.height} min={0.7} max={1.8} step={0.05} onChange={(v) => set({ height: v })} format={pct} />
            {hasLogo && (
              <>
                <Choice k="logoSide" options={[['right', 'Logo right'], ['left', 'Logo left']]} />
                <Slider label="Logo size" value={hd.logoSize} min={0.4} max={1.4} step={0.05} onChange={(v) => set({ logoSize: v })} format={pct} />
              </>
            )}
          </Section>
        )}
    </div>
  );
}

export { HEADER_DEFAULTS };
