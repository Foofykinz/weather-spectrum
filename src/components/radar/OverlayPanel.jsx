import React from 'react';
import { X, Zap, AlertTriangle, Target, Snowflake, Thermometer } from 'lucide-react';

// Everything drawn on top of the radar, in one place: warnings, storm markers,
// lightning, wind and winter alerts, and airport station readings.
// items: { warnings, storms, lightning, zones } booleans; obs: null | 'temps' | 'wind'.
// onChange(changes): URL parameter changes, as RadarPage's updateParams takes them.
export default function OverlayPanel({ open, onClose, warnings, storms, lightning, zones, obs, onChange, pastMode = false }) {
  if (!open) return null;
  const rows = [
    { key: 'warnings', on: warnings, icon: AlertTriangle, name: 'Warnings', desc: 'Tornado, severe thunderstorm, flash flood and other NWS warning polygons, plus tornado and severe thunderstorm watches.', set: (v) => ({ warn: v ? null : '0' }) },
    { key: 'storms', on: storms, icon: Target, name: 'Storm markers', desc: 'Rotation, tornado vortex signatures, large hail and storm motion (NWS radar algorithms).', set: (v) => ({ storms: v ? null : '0' }) },
    { key: 'lightning', on: lightning, icon: Zap, name: 'Lightning', desc: 'Lightning flashes seen by the GOES satellites.', set: (v) => ({ ltg: v ? '1' : null }), live: true },
    { key: 'zones', on: zones, icon: Snowflake, name: 'Wind and winter alerts', desc: 'High wind, winter storm, blizzard, ice storm and lake effect snow warnings, watches and advisories (NWS). Tap an area for details.', set: (v) => ({ zones: v ? null : '0' }), live: true },
  ];
  return (
    <div className="pointer-events-auto w-full sm:w-80 min-h-0 flex flex-col overflow-y-auto rounded-lg border border-slate-700/80 bg-slate-900/95 backdrop-blur shadow-2xl text-sm text-slate-200">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700/80">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Overlays</h2>
        <button type="button" onClick={onClose} aria-label="Close overlays" className="p-1 rounded hover:bg-slate-700">
          <X className="w-4 h-4" />
        </button>
      </div>
      <ul className="divide-y divide-slate-800">
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
    </div>
  );
}

function Switch({ on }) {
  return (
    <span aria-hidden className={`mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${on ? 'bg-sky-500' : 'bg-slate-700'}`}>
      <span className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : ''}`} />
    </span>
  );
}
