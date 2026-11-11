import React, { Suspense, lazy } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CITIES, RADARS, STATION_PAGES, WFO_NAMES, COVERAGE_KM, stateName, compass, radarGeometry, fmt } from '../seo/places';
import { cityPath, stationPath } from '../seo/meta';
import { STATIONS } from '../radar/stations';
import StationLive from '../components/seo/StationLive';
import NotFound from './NotFound';

const RadarEmbed = lazy(() => import('../components/radar/RadarEmbed'));

// Every NEXRAD radar (from the full network list) within reach of a point.
function coveringRadars(lat, lon) {
  return STATIONS.filter((s) => s.state !== 'Intl')
    .map((s) => ({ s, detail: RADARS[s.id], ...radarGeometry(s, lat, lon) }))
    .sort((a, b) => a.km - b.km);
}

export default function CityRadar() {
  const { slug } = useParams();
  const city = CITIES.find((c) => c.slug === slug);
  if (!city) return <NotFound />;

  const all = coveringRadars(city.lat, city.lon);
  const covering = all.filter((x) => x.km <= COVERAGE_KM);
  const nearest = covering[0];
  const second = all[1];
  const primary = RADARS[city.primary];
  const at = `${city.lat.toFixed(3)},${city.lon.toFixed(3)},9`;
  const others = CITIES.filter((c) => c.slug !== city.slug);

  return (
    <div className="bg-gradient-to-b from-slate-900 to-slate-950">
      <div className="max-w-5xl mx-auto px-5 sm:px-6 py-10 sm:py-14">
        <nav aria-label="Breadcrumb" className="text-xs text-slate-400">
          <Link to="/" className="hover:text-white">Home</Link> <span aria-hidden>/</span>{' '}
          <Link to="/radar" className="hover:text-white">Radar</Link> <span aria-hidden>/</span> {city.name}
        </nav>
        <h1 className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight text-white">{city.name} Weather Radar</h1>
        <p className="mt-3 text-slate-300 leading-relaxed max-w-3xl">
          Live radar centered on {city.name}, {stateName(city.state)}, from the {nearest.s.icao} NEXRAD radar{' '}
          {fmt(nearest.mi)} miles {compass(nearest.bearing)} of the city center.
        </p>

        <div className="mt-6 h-[420px] sm:h-[520px] overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f17]">
          <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-slate-400">Loading live radar…</div>}>
            <RadarEmbed stationId={primary.id} center={{ lat: city.lat, lon: city.lon, zoom: 8 }} />
          </Suspense>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            to={`/radar?product=site-reflectivity&site=${primary.id}&at=${at}`}
            className="inline-flex items-center rounded-xl bg-gradient-to-r from-orange-500 to-yellow-500 px-5 py-2.5 font-semibold text-slate-950 shadow-lg shadow-orange-500/20"
          >
            Open full radar
          </Link>
          <Link
            to={`/radar?layout=2&site=${primary.id}&at=${at}`}
            className="inline-flex items-center rounded-xl border border-white/15 px-5 py-2.5 font-semibold text-slate-100 hover:bg-white/5"
          >
            Reflectivity and velocity side by side
          </Link>
        </div>

        <section className="mt-12">
          <h2 className="text-xl font-semibold text-white">{primary.icao} right now</h2>
          <div className="mt-4 rounded-2xl border border-white/10 bg-slate-900/60 p-5">
            <StationLive station={nearest.s} />
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-semibold text-white">Radars covering {city.name}</h2>
          <p className="mt-2 text-sm text-slate-400 max-w-3xl">
            NEXRAD radars within {fmt(COVERAGE_KM)} km ({fmt(COVERAGE_KM * 0.621371)} miles) of the city center. Beam height is the
            center of each radar&apos;s lowest (0.5°) beam over the city, above the radar&apos;s own elevation; the farther the
            radar, the higher in the storm it samples.
          </p>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-slate-900/80 text-left text-slate-400">
                <tr>
                  <th className="px-4 py-2 font-medium">Radar</th>
                  <th className="px-4 py-2 font-medium">Distance</th>
                  <th className="px-4 py-2 font-medium">Direction</th>
                  <th className="px-4 py-2 font-medium">Lowest beam over city</th>
                  <th className="px-4 py-2 font-medium">NWS office</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-200 tabular-nums">
                {covering.map((x) => (
                  <tr key={x.s.id}>
                    <td className="px-4 py-2">
                      {STATION_PAGES.includes(x.s.id) ? (
                        <Link to={stationPath(RADARS[x.s.id])} className="text-orange-300 hover:text-orange-200">{x.s.icao}</Link>
                      ) : (
                        x.s.icao
                      )}{' '}
                      <span className="text-slate-400">{x.s.name}, {x.s.state}</span>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">{fmt(x.mi)} mi ({fmt(x.km)} km)</td>
                    <td className="px-4 py-2">{compass(x.bearing)}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{fmt(Math.round(x.beamFt / 10) * 10)} ft</td>
                    <td className="px-4 py-2">{x.detail ? WFO_NAMES[x.detail.wfo] || x.detail.wfo : <span className="text-slate-500">-</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-sm text-slate-300 leading-relaxed max-w-3xl">
            {nearest.s.icao}&apos;s lowest beam passes about {fmt(Math.round(nearest.beamFt / 10) * 10)} ft above the radar&apos;s
            elevation over {city.name}.{' '}
            {covering.length > 1
              ? `The next closest radar, ${second.s.icao} (${second.s.name}), is ${fmt(second.mi)} miles away, where its lowest beam is about ${fmt(Math.round(second.beamFt / 100) * 100)} ft up, so it sees the middle and upper parts of storms over the city rather than the lowest levels.`
              : `No other NEXRAD radar is within ${fmt(COVERAGE_KM * 0.621371)} miles. The next closest, ${second.s.icao} (${second.s.name}), is ${fmt(second.mi)} miles away, where its lowest beam is about ${fmt(Math.round(second.beamFt / 100) * 100)} ft up, so near-ground detail over ${city.name} depends on ${nearest.s.icao}.`}
          </p>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-semibold text-white">{primary.icao} station details</h2>
          <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-3 text-sm">
            <div><dt className="text-slate-400">Location</dt><dd className="mt-0.5 text-slate-100">{primary.county} County, {stateName(primary.state)}</dd></div>
            <div><dt className="text-slate-400">Coordinates</dt><dd className="mt-0.5 text-slate-100 tabular-nums">{primary.lat.toFixed(3)}, {primary.lon.toFixed(3)}</dd></div>
            <div><dt className="text-slate-400">Ground elevation</dt><dd className="mt-0.5 text-slate-100 tabular-nums">{fmt(primary.elevationM)} m ({fmt(primary.elevationM * 3.28084)} ft)</dd></div>
            <div><dt className="text-slate-400">NWS office</dt><dd className="mt-0.5 text-slate-100">{WFO_NAMES[primary.wfo]}</dd></div>
            <div><dt className="text-slate-400">Radar type</dt><dd className="mt-0.5 text-slate-100">WSR-88D (NEXRAD)</dd></div>
            {STATION_PAGES.includes(primary.id) && (
              <div><dt className="text-slate-400">More</dt><dd className="mt-0.5"><Link to={stationPath(primary)} className="text-orange-300 hover:text-orange-200">{primary.icao} station page</Link></dd></div>
            )}
          </dl>
          <p className="mt-4 text-xs text-slate-500">Station data: Iowa Environmental Mesonet NEXRAD network list. Live status: Iowa Environmental Mesonet and NOAA NEXRAD Level III data.</p>
        </section>

        <section className="mt-12 border-t border-white/10 pt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Radar for other cities</h2>
          <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
            {others.map((c) => (
              <li key={c.slug}><Link to={cityPath(c)} className="text-orange-300 hover:text-orange-200">{c.name} radar</Link></li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
