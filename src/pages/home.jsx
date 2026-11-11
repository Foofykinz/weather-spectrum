import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

// Faint 60px grid, drawn as an inline SVG (no extra request).
const GRID =
  "url(\"data:image/svg+xml,%3Csvg width='60' height='60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M60 0H0v60' fill='none' stroke='%23ffffff' stroke-opacity='0.04'/%3E%3C/svg%3E\")";

const PRODUCTS = [
  'Super-resolution reflectivity',
  'Base and storm-relative velocity',
  'Correlation coefficient',
  'Differential reflectivity',
  'Specific differential phase',
  'Hydrometeor classification',
  'Echo tops and VIL',
  'Satellite lightning',
];

const SOURCES = [
  {
    name: 'NOAA / National Weather Service',
    use: 'Single-radar velocity and hydrometeor classification imagery, and national composite reflectivity and echo tops (MRMS), from the radar.weather.gov map service.',
    href: 'https://radar.weather.gov/',
  },
  {
    name: 'NOAA NEXRAD Level III',
    use: 'Correlation coefficient, differential reflectivity, specific differential phase, enhanced echo tops and digital VIL, decoded from radar data published through the NOAA Open Data Dissemination program (Unidata, AWS).',
    href: 'https://registry.opendata.aws/noaa-nexrad/',
  },
  {
    name: 'Iowa Environmental Mesonet',
    use: 'National base reflectivity mosaic, super-resolution base reflectivity and storm-relative velocity imagery. Iowa State University.',
    href: 'https://mesonet.agron.iastate.edu/',
  },
  {
    name: 'NOAA GOES-19 and GOES-18 GLM',
    use: 'Satellite-detected lightning flashes from the Geostationary Lightning Mapper, published through the NOAA Open Data Dissemination program (AWS) and processed by Weather Spectrum.',
    href: 'https://www.goes-r.gov/spacesegment/glm.html',
  },
  {
    name: 'OpenFreeMap',
    use: 'Basemap. Map data from OpenMapTiles and OpenStreetMap contributors.',
    href: 'https://openfreemap.org/',
  },
];

export default function Home() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900">
        <div className="absolute inset-0" style={{ backgroundImage: GRID }} aria-hidden />
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-blue-500 opacity-10 blur-3xl" aria-hidden />
        <div className="absolute -bottom-32 right-0 w-96 h-96 rounded-full bg-orange-500 opacity-10 blur-3xl" aria-hidden />

        <div className="relative max-w-5xl mx-auto px-5 sm:px-6 pt-24 pb-28 sm:pt-32 sm:pb-36 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-300">Live NEXRAD radar</p>
          <h1 className="mt-5 text-4xl sm:text-6xl md:text-7xl font-bold leading-[1.05] tracking-tight text-white">
            Weather radar for
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-orange-400 via-yellow-400 to-orange-500">
              storm chasers
            </span>
          </h1>
          <p className="mt-6 text-base sm:text-lg leading-relaxed text-gray-300 max-w-2xl mx-auto">
            Reflectivity, velocity, dual-polarization products and lightning from NOAA radar data, updated as each scan
            arrives, with values you can read directly from the map.
          </p>

          <div className="mt-11">
            <Link to="/radar" className="relative inline-block group">
              <span
                className="absolute inset-0 rounded-2xl bg-gradient-to-r from-orange-500 to-yellow-500 blur-xl opacity-60 group-hover:opacity-90 transition-opacity"
                aria-hidden
              />
              <span className="relative flex items-center gap-3 rounded-2xl bg-gradient-to-r from-orange-500 to-yellow-500 px-10 sm:px-14 py-5 text-xl font-bold text-slate-950 shadow-2xl">
                Live Radar
                <ArrowRight className="w-6 h-6" aria-hidden />
              </span>
            </Link>
          </div>

          <ul className="mt-12 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-gray-400 max-w-3xl mx-auto">
            {PRODUCTS.map((p) => (
              <li key={p} className="flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-orange-400/70" aria-hidden />
                {p}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Data sources and attribution */}
      <section className="bg-slate-950 border-t border-white/5">
        <div className="max-w-5xl mx-auto px-5 sm:px-6 py-16 sm:py-20">
          <h2 className="text-2xl font-bold text-white">Data sources</h2>
          <p className="mt-3 text-slate-400 max-w-3xl leading-relaxed">
            Weather Spectrum displays real observations published by the organizations below. It is an independent project
            and is not affiliated with or endorsed by any of them. Data can be delayed or unavailable; follow official
            National Weather Service warnings for safety decisions.
          </p>
          <dl className="mt-10 grid gap-4 sm:grid-cols-2">
            {SOURCES.map((s) => (
              <div key={s.name} className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
                <dt>
                  <a href={s.href} target="_blank" rel="noopener noreferrer" className="font-semibold text-white hover:text-orange-300 transition-colors">
                    {s.name}
                  </a>
                </dt>
                <dd className="mt-2 text-sm leading-relaxed text-slate-400">{s.use}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </>
  );
}
