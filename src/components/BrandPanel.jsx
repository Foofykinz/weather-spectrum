import React, { useRef, useState } from 'react';
import { ChevronDown, Upload, Trash2 } from 'lucide-react';
import { DEFAULT_BRAND, readLogo } from '../brand/brand';

// "Your branding" section of the post makers. brandState = useBrand().
export default function BrandPanel({ brandState }) {
  const [brand, setBrand, { saveError }] = brandState;
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);
  const label = 'block text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5';
  const input = 'w-full rounded-md border border-slate-700/80 bg-slate-950 px-2.5 py-1.5 text-sm text-slate-100';

  const pickLogo = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setBrand({ logo: await readLogo(file), enabled: true });
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="rounded-lg border border-slate-700/80">
      <div className="flex items-center gap-2 px-3 py-2">
        <label className="flex flex-1 items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={brand.enabled} onChange={(e) => setBrand({ enabled: e.target.checked })} />
          Use my branding
        </label>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex items-center gap-1 text-xs text-sky-300 hover:text-sky-200">
          {open ? 'Hide' : 'Edit'} <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {open && (
        <div className="space-y-3 border-t border-slate-800 px-3 py-3">
          <div>
            <span className={label}>Logo</span>
            <div className="flex items-center gap-2">
              {brand.logo ? (
                <img src={brand.logo} alt="Your logo" className="h-10 max-w-[7rem] rounded bg-slate-800 object-contain p-1" />
              ) : (
                <span className="text-xs text-slate-500">None</span>
              )}
              <button type="button" onClick={() => fileRef.current?.click()} className="ml-auto flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-800">
                <Upload className="h-3.5 w-3.5" /> {brand.logo ? 'Change' : 'Upload'}
              </button>
              {brand.logo && (
                <button type="button" onClick={() => setBrand({ logo: null })} aria-label="Remove logo" className="rounded-md border border-slate-700 p-1 text-slate-300 hover:bg-slate-800">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={pickLogo} className="hidden" />
            </div>
            <span className="mt-1 block text-[11px] text-slate-500">PNG with a see-through background looks best. If it&apos;s hard to see, change the main color below.</span>
          </div>
          <label className="block">
            <span className={label}>Page name or handle</span>
            <input className={input} value={brand.name} maxLength={40} placeholder="Smith County Weather" onChange={(e) => setBrand({ name: e.target.value, enabled: true })} />
          </label>
          <label className="block">
            <span className={label}>Website or link</span>
            <input className={input} value={brand.link} maxLength={60} placeholder="facebook.com/smithcowx" onChange={(e) => setBrand({ link: e.target.value, enabled: true })} />
          </label>
          <div className="flex items-end gap-3">
            <label className="block">
              <span className={label}>Main color</span>
              <input type="color" value={brand.primary} onChange={(e) => setBrand({ primary: e.target.value, enabled: true })} className="h-8 w-14 cursor-pointer rounded border border-slate-700 bg-slate-950" />
            </label>
            <label className="block">
              <span className={label}>Accent</span>
              <input type="color" value={brand.accent} onChange={(e) => setBrand({ accent: e.target.value, enabled: true })} className="h-8 w-14 cursor-pointer rounded border border-slate-700 bg-slate-950" />
            </label>
            <button type="button" onClick={() => setBrand({ primary: DEFAULT_BRAND.primary, accent: DEFAULT_BRAND.accent })} className="mb-1 text-xs text-sky-300 hover:text-sky-200">
              Reset colors
            </button>
          </div>
          {error && <p className="text-xs text-amber-300">{error}</p>}
          <p className="text-[11px] leading-snug text-slate-500">
            {saveError ? "Couldn't save on this device; it will be used until you leave the page." : 'Saved on this device only.'} Your branding replaces the
            Weather Spectrum name on the image; the data and map credit line stays.
          </p>
        </div>
      )}
    </div>
  );
}
