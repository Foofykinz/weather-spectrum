import React, { Suspense, lazy } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EVENTS, eventPath, eventTitle } from '../seo/events';
import { getStation } from '../radar/stations';
import NotFound from './NotFound';

const EventReplay = lazy(() => import('../components/seo/EventReplay'));

const PHEN = { TO: 'Tornado Warning', SV: 'Severe Thunderstorm Warning' };
const time = (iso, tz) => new Date(iso).toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });

export default function EventPage() {
  const { slug } = useParams();
  const e = EVENTS.find((x) => x.slug === slug);
  if (!e) return <NotFound />;
  const station = getStation(e.radar);
  const others = EVENTS.filter((x) => x.slug !== e.slug);

  return (
    <div className="bg-gradient-to-b from-slate-900 to-slate-950">
      <article className="max-w-5xl mx-auto px-5 sm:px-6 py-10 sm:py-14">
        <nav aria-label="Breadcrumb" className="text-xs text-slate-400">
          <Link to="/" className="hover:text-white">Home</Link> <span aria-hidden>/</span>{' '}
          <Link to="/events" className="hover:text-white">Tornado radar replays</Link> <span aria-hidden>/</span> {e.short}
        </nav>
        <h1 className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight text-white">{eventTitle(e)}</h1>
        <p className="mt-2 text-slate-400">
          {e.place} · {e.rating} · NEXRAD {station.icao} ({station.name})
        </p>

        <div className="isolate mt-6 h-[440px] sm:h-[560px] overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f17]">
          <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-slate-400">Loading the radar replay…</div>}>
            <EventReplay event={e} />
          </Suspense>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Real archived scans from the {station.icao} radar ({e.date >= '2020-04-01' ? 'NOAA NEXRAD Level III, every low-level scan' : 'NOAA NEXRAD Level II, one low-level scan per volume, as often as radars scanned it then'}), with the NWS warnings in
          effect at each scan and automated storm markers from the NWS radar algorithms. Tap the map to read exact values.
        </p>

        <section className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div>
            <h2 className="text-xl font-semibold text-white">What happened</h2>
            <p className="mt-3 leading-relaxed text-slate-300">{e.summary}</p>

            <h2 className="mt-8 text-xl font-semibold text-white">What to look for on radar</h2>
            <ul className="mt-3 space-y-2 leading-relaxed text-slate-300">
              <li>
                <strong className="text-slate-100">Reflectivity:</strong> the hook echo, a curl of precipitation wrapping around the storm&apos;s rotation, usually on
                its southwest side.
              </li>
              <li>
                <strong className="text-slate-100">Velocity:</strong> a velocity couplet, strong winds toward the radar (green) right next to strong winds away from
                it (red), marks the rotation itself.
              </li>
              <li>
                <strong className="text-slate-100">Correlation coefficient:</strong> a small area of unusually low values at the couplet, a debris signature, means
                the radar is seeing debris lofted by a tornado.
              </li>
            </ul>

            <h2 className="mt-8 text-xl font-semibold text-white">Warning timeline</h2>
            <p className="mt-2 text-sm text-slate-400">From the National Weather Service warnings and their updates, as issued.</p>
            <ol className="mt-4 space-y-5">
              {e.warnings.map((w) => (
                <li key={`${w.phen}${w.etn}`} className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className={`font-semibold ${w.phen === 'TO' ? 'text-red-300' : 'text-amber-300'}`}>{PHEN[w.phen]}</span>
                    {w.tags.emergency && <span className="rounded bg-fuchsia-600/30 px-1.5 py-0.5 text-xs font-bold text-fuchsia-200">Tornado Emergency</span>}
                    <span className="text-sm text-slate-400">
                      {time(w.issued, e.tz)} to {time(w.expires, e.tz)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-400">{w.counties.join('; ')}</p>
                  {w.first && <p className="mt-2 font-mono text-xs leading-relaxed text-slate-200">{w.first}</p>}
                  {w.updates.length > 0 && (
                    <ul className="mt-2 space-y-1 border-l border-white/10 pl-3 font-mono text-xs text-slate-400">
                      {w.updates.map((u) => (
                        <li key={u.time}>
                          <span className="font-sans text-slate-300">{time(u.time, e.tz)}:</span> {u.line}
                        </li>
                      ))}
                    </ul>
                  )}
                  <a href={w.link} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs text-amber-300 hover:text-amber-200">
                    Full warning text (IEM archive)
                  </a>
                </li>
              ))}
            </ol>
          </div>

          <aside>
            <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-300">Fast facts</h2>
              <dl className="mt-3 space-y-2 text-sm">
                {e.facts.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 border-b border-white/5 pb-1.5">
                    <dt className="text-slate-400">{k}</dt>
                    <dd className="text-right text-slate-100">{v}</dd>
                  </div>
                ))}
              </dl>
              <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">Sources</h3>
              <ul className="mt-1 space-y-1 text-xs">
                {e.sources.map((s) => (
                  <li key={s.label}>
                    {s.url ? (
                      <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-amber-300 hover:text-amber-200">
                        {s.label}
                      </a>
                    ) : (
                      <span className="text-slate-300">{s.label}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            {others.length > 0 && (
              <div className="mt-6 rounded-2xl border border-white/10 bg-slate-900/60 p-5">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-300">More radar replays</h2>
                <ul className="mt-2 space-y-1 text-sm">
                  {others.map((o) => (
                    <li key={o.slug}>
                      <Link to={eventPath(o)} className="text-slate-200 hover:text-white">
                        {eventTitle(o)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        </section>
      </article>
    </div>
  );
}
