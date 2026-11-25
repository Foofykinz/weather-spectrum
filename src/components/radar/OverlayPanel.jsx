import React from 'react';
import { X, Zap, AlertTriangle, Target, Snowflake, Thermometer, Palette, Map as MapIcon } from 'lucide-react';
import { STYLE_GROUPS, defaultColor, defaultFill } from '../../radar/alertStyle';

// Everything drawn on top of the radar, in one place: warnings, storm markers,
// lightning, wind and winter alerts, and airport station readings.
// items: { warnings, storms, lightning, zones } booleans; obs: null | 'temps' | 'wind'.
// onChange(changes): URL parameter changes, as RadarPage's updateParams takes them.
// alertStyle / onAlertStyle: the viewer's alert colors and fill level (radar/alertStyle).
// basemap / onBasemap: the background map, 'dark' or 'terrain'.
export default function OverlayPanel({ open, onClose, warnings, storms, lightning, zones, obs, onChange, alertStyle, onAlertStyle, basemap, onBasemap, pastMode = false }) {
  if (!open) return null;
  const rows = [
    { key: 'warnings', on: warnings, icon: AlertTriangle, name: 'Warnings', desc: 'Tornado, severe thunderstorm, flash flood and other NWS warning polygons, plus tornado and severe thunderstorm watches.', set: (v) => ({ warn: v ? null : '0' }), opacity: 'warnFill' },
    { key: 'storms', on: storms, icon: Target, name: 'Storm markers', desc: 'Rotation, tornado vortex signatures, large hail and storm motion (NWS radar algorithms).', set: (v) => ({ storms: v ? null : '0' }) },
    { key: 'lightning', on: lightning, icon: Zap, name: 'Lightning', desc: 'Lightning flashes seen by the GOES satellites.', set: (v) => ({ ltg: v ? '1' : null }), live: true },
    { key: 'zones', on: zones, icon: Snowflake, name: 'Wind and winter alerts', desc: 'High wind, winter storm, blizzard, ice storm and lake effect snow warnings, watches and advisories (NWS). Tap an area for details.', set: (v) => ({ zones: v ? null : '0' }), live: true, opacity: 'zoneFill' },
  ];
  return (
    <div className="ws-glass ws-glass-panel pointer-events-auto w-full sm:w-80 min-h-0 flex flex-col overflow-y-auto rounded-lg border border-slate-700/80 bg-slate-900/95 backdrop-blur shadow-2xl text-sm text-slate-200">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700/80">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Overlays</h2>
        <button type="button" onClick={onClose} aria-label="Close overlays" className="p-1 rounded hover:bg-slate-700">
          <X className="w-4 h-4" />
        </button>
      </div>
      <ul className="divide-y divide-slate-800">
        {onBasemap && (
          <li className="px-3 py-2.5">
            <div className="flex items-start gap-3">
              <MapIcon className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-slate-100">Map</div>
                <div className="text-xs leading-snug text-slate-400">
                  {basemap === 'terrain'
                    ? 'Satellite view of the land with county lines, highways and towns.'
                    : basemap === 'night'
                      ? 'The dark map with city lights seen from space at night (NASA satellite imagery).'
                      : 'Dark map that keeps the radar colors easy to read.'}
                </div>
                <div className="mt-2 inline-flex rounded-md border border-slate-700 p-0.5" role="radiogroup" aria-label="Map">
                  {[
                    ['dark', 'Dark'],
                    ['terrain', 'Terrain'],
                    ['night', 'Night'],
                  ].map(([v, label]) => (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={basemap === v}
                      onClick={() => onBasemap(v)}
                      className={`rounded px-2.5 py-1 text-xs font-semibold ${basemap === v ? 'bg-sky-400/20 text-sky-200' : 'text-slate-300 hover:bg-slate-800'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </li>
        )}
        {rows.map((r) => {
          const off = pastMode && r.live;
          const on = r.on && !off;
          return (
            <li key={r.key}>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                disabled={off}
                onClick={() => onChange(r.set(!r.on))}
                className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-slate-800/70 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <r.icon className={`mt-0.5 h-4 w-4 shrink-0 ${on ? 'text-sky-300' : 'text-slate-500'}`} />
                <span className="min-w-0 flex-1">
                  <span className={`block font-semibold ${on ? 'text-slate-100' : 'text-slate-300'}`}>{r.name}</span>
                  <span className="block text-xs leading-snug text-slate-400">{off ? 'Live only: not available for past dates.' : r.desc}</span>
                </span>
                <Switch on={on} />
              </button>
              {on && r.opacity && alertStyle && (
                <div className="px-3 pb-2.5 pl-10 text-xs text-slate-400">
                  <label className="flex items-center gap-3">
                    <span className="w-14 shrink-0">Opacity</span>
                    <input
                      type="range"
                      min="0.01"
                      max="1"
                      step="0.01"
                      value={alertStyle[r.opacity]}
                      onChange={(e) => onAlertStyle({ [r.opacity]: Number(e.target.value) })}
                      className="flex-1 accent-sky-400"
                      aria-label={`${r.name} opacity`}
                    />
                    <span className="w-9 text-right tabular-nums">{Math.round(alertStyle[r.opacity] * 100)}%</span>
                  </label>
                  <div className="mt-0.5 flex justify-between pl-[4.25rem] text-[11px] text-slate-500">
                    <span>Barely visible</span>
                    {alertStyle[r.opacity] !== defaultFill(r.opacity) ? (
                      <button type="button" className="text-sky-300 hover:text-sky-200" onClick={() => onAlertStyle({ [r.opacity]: defaultFill(r.opacity) })}>
                        Reset
                      </button>
                    ) : null}
                    <span>Solid</span>
                  </div>
                </div>
              )}
            </li>
          );
        })}
        <li className={`px-3 py-2.5 ${pastMode ? 'opacity-40' : ''}`}>
          <div className="flex items-start gap-3">
            <Thermometer className={`mt-0.5 h-4 w-4 shrink-0 ${obs && !pastMode ? 'text-sky-300' : 'text-slate-500'}`} />
            <div className="min-w-0 flex-1">
              <div className={`font-semibold ${obs && !pastMode ? 'text-slate-100' : 'text-slate-300'}`}>Station readings</div>
              <div className="text-xs leading-snug text-slate-400">
                {pastMode ? 'Live only: not available for past dates.' : 'Current readings at airport weather stations. Shown when zoomed in to about state level.'}
              </div>
              <div className="mt-2 inline-flex rounded-md border border-slate-700 p-0.5" role="radiogroup" aria-label="Station readings">
                {[
                  [null, 'Off'],
                  ['temps', 'Temperature'],
                  ['wind', 'Wind'],
                ].map(([v, label]) => (
                  <button
                    key={label}
                    type="button"
                    role="radio"
                    aria-checked={obs === v}
                    disabled={pastMode}
                    onClick={() => onChange({ obs: v })}
                    className={`rounded px-2.5 py-1 text-xs font-semibold ${obs === v ? 'bg-sky-400/20 text-sky-200' : 'text-slate-300 hover:bg-slate-800'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </li>
      </ul>
      {alertStyle && <ColorSettings alertStyle={alertStyle} onAlertStyle={onAlertStyle} />}
    </div>
  );
}

// Colors for each alert type (saved in this browser; the NWS colors are the default).
function ColorSettings({ alertStyle, onAlertStyle }) {
  const changed = Object.keys(alertStyle.colors).length > 0;
  const setColor = (event, color) => onAlertStyle({ colors: { ...alertStyle.colors, [event]: color } });
  return (
    <details className="border-t border-slate-700/80">
      <summary className="flex cursor-pointer items-center gap-3 px-3 py-2.5 font-semibold text-slate-300 hover:bg-slate-800/70">
        <Palette className="h-4 w-4 shrink-0 text-slate-500" />
        <span className="flex-1">Alert colors</span>
        {changed && <span className="text-xs font-normal text-sky-300">Custom</span>}
      </summary>
      <div className="space-y-3 px-3 pb-3">
        <p className="text-xs leading-snug text-slate-400">Pick your own color for any alert. It's used on the map, in the tap details and in posts, and saved in this browser.</p>
        {STYLE_GROUPS.map(([group, types]) => (
          <div key={group}>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{group}</div>
            <ul className="space-y-1">
              {types.map((t) => {
                const value = alertStyle.colors[t.event] || defaultColor(t);
                return (
                  <li key={t.event} className="flex items-center gap-2 text-xs">
                    <input
                      type="color"
                      value={value.toLowerCase()}
                      onChange={(e) => setColor(t.event, e.target.value)}
                      aria-label={`${t.event} color`}
                      className="h-6 w-8 shrink-0 cursor-pointer rounded border border-slate-700 bg-transparent p-0"
                    />
                    <span className="flex-1 text-slate-200">{t.event}</span>
                    {alertStyle.colors[t.event] && (
                      <button
                        type="button"
                        className="text-slate-400 hover:text-sky-300"
                        onClick={() => {
                          const { [t.event]: _, ...rest } = alertStyle.colors;
                          onAlertStyle({ colors: rest });
                        }}
                      >
                        Reset
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {changed && (
          <button type="button" className="text-xs text-sky-300 hover:text-sky-200" onClick={() => onAlertStyle({ colors: {} })}>
            Use the NWS colors for everything
          </button>
        )}
      </div>
    </details>
  );
}

function Switch({ on }) {
  return (
    <span aria-hidden className={`mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${on ? 'bg-sky-500' : 'bg-slate-700'}`}>
      <span className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : ''}`} />
    </span>
  );
}
