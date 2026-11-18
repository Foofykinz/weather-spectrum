import React from 'react';
import { Link } from 'react-router-dom';

export default function StormLabPro() {
  return (
    <div className="bg-gradient-to-b from-slate-900 via-blue-950 to-slate-950">
      <div className="max-w-3xl mx-auto px-5 sm:px-6 py-24 sm:py-32 text-center">
        <img src="/logo-192.png" alt="" width="96" height="96" className="mx-auto h-24 w-24" />
        <p className="mt-8 text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">Weather Spectrum</p>
        <h1 className="mt-3 text-4xl sm:text-5xl font-bold tracking-tight text-white">
          Storm Lab <span className="ws-spectrum-text">Pro</span>
        </h1>
        <span className="mt-6 inline-block rounded-full border border-sky-400/40 bg-sky-400/10 px-4 py-1.5 text-sm font-semibold text-sky-200">
          Coming soon
        </span>
        <p className="mt-6 text-lg leading-relaxed text-gray-300">
          We&apos;re building it now. Check back soon.
        </p>
        <div className="mt-10 flex justify-center gap-3">
          <Link to="/radar" className="rounded-xl ws-spectrum px-5 py-2.5 font-semibold text-slate-950">
            Live Radar
          </Link>
          <Link to="/" className="rounded-xl border border-white/15 px-5 py-2.5 font-semibold text-slate-100 hover:bg-white/5">
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
