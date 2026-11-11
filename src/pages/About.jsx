import React from 'react';
import { Link } from 'react-router-dom';

const FEATURES = [
  'Reflectivity, velocity and storm-relative velocity from individual NEXRAD radars, plus national mosaics',
  'Dual-polarization products (correlation coefficient, differential reflectivity, specific differential phase) decoded directly from NOAA Level III data, with selectable elevation tilts',
  'Echo tops, vertically integrated liquid and hydrometeor classification',
  'Tap the map to read the exact value of a radar bin',
  'GOES satellite lightning flashes, updated about once a minute',
  'Scan times and data freshness shown for every product',
];

export default function About() {
  return (
    <div className="bg-gradient-to-b from-slate-900 to-slate-950">
      <div className="max-w-3xl mx-auto px-5 sm:px-6 py-16 sm:py-20">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-300">About</p>
        <h1 className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight text-white">Weather Spectrum</h1>
        <p className="mt-5 text-lg leading-relaxed text-gray-300">
          Weather Spectrum is a radar viewer for anyone who follows severe weather closely.
          It brings NEXRAD radar products and satellite lightning together on one fast map, using real observations
          published by NOAA and its partners.
        </p>

        <h2 className="mt-12 text-xl font-semibold text-white">What it does</h2>
        <ul className="mt-4 space-y-3">
          {FEATURES.map((f) => (
            <li key={f} className="flex gap-3 text-slate-300 leading-relaxed">
              <span className="mt-2.5 w-1.5 h-1.5 shrink-0 rounded-full bg-orange-400" aria-hidden />
              {f}
            </li>
          ))}
        </ul>

        <h2 className="mt-12 text-xl font-semibold text-white">Data</h2>
        <p className="mt-4 text-slate-300 leading-relaxed">
          Every product shows actual observations. Nothing is simulated or smoothed into something it is not. Legends come
          from the providers&apos; own color tables or from the values in the data itself. Sources include NOAA and the
          National Weather Service, NOAA NEXRAD Level III data, GOES-19 and GOES-18 lightning data, the Iowa
          Environmental Mesonet and OpenFreeMap. See the{' '}
          <Link to="/" className="text-orange-300 hover:text-orange-200">data sources</Link> on the home page for details.
        </p>

        <h2 className="mt-12 text-xl font-semibold text-white">Independence and safety</h2>
        <p className="mt-4 text-slate-300 leading-relaxed">
          Weather Spectrum is an independent project. It is not affiliated with or endorsed by NOAA, the National Weather
          Service or any other data provider. Data can be delayed or unavailable. It is not a warning service: follow
          official National Weather Service watches and warnings for safety decisions.
        </p>

        <h2 className="mt-12 text-xl font-semibold text-white">Contact</h2>
        <p className="mt-4 text-slate-300">
          <a href="mailto:theweatherspectrum@gmail.com" className="text-orange-300 hover:text-orange-200">
            theweatherspectrum@gmail.com
          </a>
        </p>

        <div className="mt-12">
          <Link
            to="/radar"
            className="inline-flex items-center rounded-xl bg-gradient-to-r from-orange-500 to-yellow-500 px-6 py-3 font-semibold text-slate-950 shadow-lg shadow-orange-500/20"
          >
            Open Live Radar
          </Link>
        </div>
      </div>
    </div>
  );
}
