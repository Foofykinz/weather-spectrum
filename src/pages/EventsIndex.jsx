import React from 'react';
import { Link } from 'react-router-dom';
import { EVENTS, eventPath, eventTitle } from '../seo/events';
import { getStation } from '../radar/stations';

// Index of historic tornado radar replays.
export default function EventsIndex() {
  const list = [...EVENTS].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="bg-gradient-to-b from-slate-900 to-slate-950">
      <div className="max-w-5xl mx-auto px-5 sm:px-6 py-10 sm:py-14">
        <nav aria-label="Breadcrumb" className="text-xs text-slate-400">
          <Link to="/" className="hover:text-white">Home</Link> <span aria-hidden>/</span> Tornado radar replays
        </nav>
        <h1 className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight text-white">Tornado Radar Replays</h1>
        <p className="mt-3 max-w-3xl leading-relaxed text-slate-300">
          Replay historic tornadoes on the real NEXRAD radar data from the time: reflectivity, velocity and correlation coefficient, with the National
          Weather Service warnings as they were issued. For any other date since 2009, use the Past button on the{' '}
          <Link to="/radar" className="text-sky-300 hover:text-sky-200">radar</Link>.
        </p>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {list.map((e) => (
            <li key={e.slug}>
              <Link to={eventPath(e)} className="block h-full rounded-2xl border border-white/10 bg-slate-900/60 p-5 hover:border-sky-400/50">
                <div className="text-lg font-semibold text-white">{eventTitle(e)}</div>
                <div className="mt-1 text-sm text-slate-400">
                  {e.place} · {e.rating} · radar {getStation(e.radar).icao}
                </div>
                <p className="mt-2 line-clamp-3 text-sm text-slate-300">{e.summary}</p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
