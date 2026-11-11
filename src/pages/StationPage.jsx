import React, { Suspense, lazy } from 'react';
import { Link, useParams } from 'react-router-dom';
import { RADARS, STATION_PAGES, WFO_NAMES, COVERAGE_KM, stateName, compass, radarGeometry, citiesNear, fmt } from '../seo/places';
import { cityPath, stationPath } from '../seo/meta';
import { STATIONS } from '../radar/stations';
import { RADAR_PRODUCTS } from '../radar/products';
import StationLive from '../components/seo/StationLive';
import NotFound from './NotFound';

const RadarEmbed = lazy(() => import('../components/radar/RadarEmbed'));

// Reusable NEXRAD station page. Enabled stations are listed in STATION_PAGES
// (src/seo/places.js); adding one there adds its page, sitemap entry and links.
export default function StationPage() {
  const { icao } = useParams();
  const radar = Object.values(RADARS).find((r) => r.icao.toLowerCase() === String(icao).toLowerCase());
  if (!radar || !STATION_PAGES.includes(radar.id)) return <NotFound />;

  const station = STATIONS.find((s) => s.id === radar.id);
  const cities = citiesNear(radar);
  const neighbors = STATIONS.filter((s) => s.id !== radar.id && s.state !== 'Intl')
    .map((s) => ({ s, ...radarGeometry(s, radar.lat, radar.lon) }))
    .filter((x) => x.km <= COVERAGE_KM)
    .sort((a, b) => a.km - b.km);
  const products = RADAR_PRODUCTS.filter((p) => p.scope === 'site');

  return (
    <div className="bg-gradient-to-b from-slate-900 to-slate-950">
      <div className="max-w-5xl mx-auto px-5 sm:px-6 py-10 sm:py-14">
        <nav aria-label="Breadcrumb" className="text-xs text-slate-400">
          <Link to="/" className="hover:text-white">Home</Link> <span aria-hidden>/</span>{' '}
          <Link to="/radar" className="hover:text-white">Radar</Link> <span aria-hidden>/</span> {radar.icao}
        </nav>
        <h1 className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight text-white">{radar.icao} NEXRAD Radar</h1>
        <p className="mt-2 text-lg text-gray-300">
          {radar.name}, {stateName(radar.state)} · NWS {WFO_NAMES[radar.wfo]} forecast office
        </p>

        <section className="mt-8">
          <h2 className="text-xl font-semibold text-white">Station details</h2>
          <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-3 text-sm">
            <div><dt className="text-slate-400">Call sign</dt><dd className="mt-0.5 text-slate-100">{radar.icao}</dd></div>
            <div><dt className="text-slate-400">Location</dt><dd className="mt-0.5 text-slate-100">{radar.county} County, {stateName(radar.state)}</dd></div>
            <div><dt className="text-slate-400">Coordinates</dt><dd className="mt-0.5 text-slate-100 tabular-nums">{radar.lat.toFixed(4)}, {radar.lon.toFixed(4)}</dd></div>
            <div><dt className="text-slate-400">Ground elevation</dt><dd className="mt-0.5 text-slate-100 tabular-nums">{fmt(radar.elevationM)} m ({fmt(radar.elevationM * 3.28084)} ft)</dd></div>
            <div><dt className="text-slate-400">NWS office</dt><dd className="mt-0.5 text-slate-100">{WFO_NAMES[radar.wfo]} ({radar.wfo})</dd></div>
            <div><dt className="text-slate-400">Radar type</dt><dd className="mt-0.5 text-slate-100">WSR-88D (NEXRAD), dual-polarization</dd></div>
          </dl>
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-semibold text-white">Current operation</h2>
          <div className="mt-4 rounded-2xl border border-white/10 bg-slate-900/60 p-5">
            <StationLive station={station} />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Tilt angles are read from the radar&apos;s latest NOAA Level III files and change with the scan strategy.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-semibold text-white">Live radar</h2>
          <div className="mt-4 h-[420px] sm:h-[500px] overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f17]">
            <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-slate-400">Loading live radar…</div>}>
              <RadarEmbed stationId={radar.id} center={{ lat: radar.lat, lon: radar.lon, zoom: 7 }} />
            </Suspense>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-semibold text-white">Open {radar.icao} products</h2>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {products.map((p) => (
              <li key={p.id}>
                <Link
                  to={`/radar?product=${p.id}&site=${radar.id}`}
                  className="flex items-baseline justify-between gap-3 rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3 hover:border-orange-400/40"
                >
                  <span className="font-medium text-slate-100">{p.name}</span>
                  <span className="text-xs text-slate-400">{p.group}</span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm">
            <Link to={`/radar?layout=4&site=${radar.id}`} className="text-orange-300 hover:text-orange-200">
              Open a four-panel view of {radar.icao}
            </Link>
          </p>
        </section>

        {cities.length > 0 && (
          <section className="mt-10">
            <h2 className="text-xl font-semibold text-white">Cities covered by {radar.icao}</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-300">
              {cities.map((x) => (
                <li key={x.city.slug}>
                  <Link to={cityPath(x.city)} className="text-orange-300 hover:text-orange-200">{x.city.name} radar</Link>
                  {' '}· {fmt(x.mi)} mi {compass((x.bearing + 180) % 360)} of the radar, lowest beam about{' '}
                  {fmt(Math.round(x.beamFt / 10) * 10)} ft above the radar&apos;s elevation
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-10">
          <h2 className="text-xl font-semibold text-white">Neighboring radars</h2>
          <ul className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2 text-sm text-slate-300 tabular-nums">
            {neighbors.map((x) => (
              <li key={x.s.id}>
                {STATION_PAGES.includes(x.s.id) ? (
                  <Link to={stationPath(RADARS[x.s.id])} className="text-orange-300 hover:text-orange-200">{x.s.icao}</Link>
                ) : (
                  <span className="text-slate-100">{x.s.icao}</span>
                )}{' '}
                {x.s.name}, {x.s.state} · {fmt(x.mi)} mi {compass(x.bearing)}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-slate-500">Station data: Iowa Environmental Mesonet NEXRAD network list.</p>
        </section>
      </div>
    </div>
  );
}
