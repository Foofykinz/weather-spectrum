import React from 'react';
import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="bg-gradient-to-b from-slate-900 to-slate-950">
      <div className="max-w-3xl mx-auto px-5 sm:px-6 py-24 text-center">
        <h1 className="text-3xl font-bold text-white">Page not found</h1>
        <p className="mt-3 text-slate-400">This page doesn&apos;t exist or has moved.</p>
        <div className="mt-8 flex justify-center gap-3">
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
