import React from 'react';

// Single, dual or quad radar view.
const OPTIONS = [
  { n: 1, label: 'Single view', icon: <rect x="2" y="2" width="12" height="12" rx="1.5" /> },
  { n: 2, label: 'Dual view', icon: (<><rect x="2" y="2" width="5.5" height="12" rx="1.2" /><rect x="8.5" y="2" width="5.5" height="12" rx="1.2" /></>) },
  {
    n: 4,
    label: 'Quad view',
    icon: (
      <>
        <rect x="2" y="2" width="5.5" height="5.5" rx="1" /><rect x="8.5" y="2" width="5.5" height="5.5" rx="1" />
        <rect x="2" y="8.5" width="5.5" height="5.5" rx="1" /><rect x="8.5" y="8.5" width="5.5" height="5.5" rx="1" />
      </>
    ),
  },
];

export default function LayoutSwitch({ layout, onChange }) {
  return (
    <div role="radiogroup" aria-label="Radar layout" className="flex shrink-0 rounded-md border border-slate-700/80 bg-slate-900/85 p-0.5 shadow-lg backdrop-blur">
      {OPTIONS.map((o) => (
        <button
          key={o.n}
          type="button"
          role="radio"
          aria-checked={layout === o.n}
          aria-label={o.label}
          title={o.label}
          onClick={() => onChange(o.n)}
          className={`flex h-7 w-8 items-center justify-center rounded ${layout === o.n ? 'bg-amber-500/20 text-amber-200' : 'text-slate-300 hover:bg-slate-800'}`}
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
            {o.icon}
          </svg>
        </button>
      ))}
    </div>
  );
}
