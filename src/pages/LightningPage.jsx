import React, { Suspense, lazy } from 'react';
import { Link } from 'react-router-dom';
import { GLM_AGES } from '../radar/providers/glm';

const LightningEmbed = lazy(() => import('../components/radar/LightningEmbed'));

const AGE_TEXT = {
  '<1 min': 'Less than a minute old',
  '1-5': '1 to 5 minutes old',
  '5-10': '5 to 10 minutes old',
  '10-15': '10 to 15 minutes old',
};

export default function LightningPage() {
  return (
    <div className="bg-gradient-to-b from-slate-900 to-slate-950">
      <div className="max-w-5xl mx-auto px-5 sm:px-6 py-10 sm:py-14">
        <nav aria-label="Breadcrumb" className="text-xs text-slate-400">
          <Link to="/" className="hover:text-white">Home</Link> <span aria-hidden>/</span> Weather radar with lightning
        </nav>
        <h1 className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight text-white">Weather Radar with Lightning</h1>
        <p className="mt-3 text-slate-300 leading-relaxed max-w-3xl">
          Free live NEXRAD weather radar with satellite lightning from NOAA&apos;s GOES-19 and GOES-18 weather satellites.
          Every flash from the last 15 minutes is marked on the map, colored by age, and new flashes arrive about once a
          minute. No account or app needed.
        </p>

        <div className="isolate mt-6 h-[440px] sm:h-[560px] overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f17]">
          <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-slate-400">Loading live radar and lightning…</div>}>
            <LightningEmbed center={{ lat: 38.5, lon: -96, zoom: 4 }} />
          </Suspense>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            to="/radar?ltg=1"
            className="inline-flex items-center rounded-xl ws-spectrum px-5 py-2.5 font-semibold text-slate-950 shadow-lg shadow-sky-400/20"
          >
            Open full radar with lightning
          </Link>
        </div>

        <section className="mt-12">
          <h2 className="text-xl font-semibold text-white">How to read the lightning marks</h2>
          <p className="mt-2 text-slate-300 leading-relaxed max-w-3xl">
            Each <span className="font-semibold">+</span> is one lightning flash. The color shows how long ago it happened, so you
            can see where storms are active right now and which way the lightning is moving.
          </p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2 max-w-2xl">
            {GLM_AGES.map((a) => (
              <li key={a.label} className="flex items-center gap-3 rounded-xl border border-white/10 bg-slate-900/60 px-4 py-2.5 text-sm text-slate-200">
                <span className="text-xl font-bold leading-none" style={{ color: a.color, opacity: a.alpha }} aria-hidden>+</span>
                {AGE_TEXT[a.label] || a.label}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-semibold text-white">Radar and lightning together</h2>
          <p className="mt-2 text-slate-300 leading-relaxed max-w-3xl">
            Radar shows where rain and hail are falling and how storms are organized. Lightning shows which of those storms are
            producing lightning right now, including flashes between radar scans. Together they make it easier to tell an
            ordinary rain shower from an active thunderstorm, and to follow storms as they grow, move and weaken.
          </p>
          <p className="mt-3 text-slate-300 leading-relaxed max-w-3xl">
            On the <Link to="/radar?ltg=1" className="text-sky-300 hover:text-sky-200">full radar</Link>, lightning is one of the
            overlays in the Overlays panel. It can sit on top of any radar product, including single-radar reflectivity and
            velocity, alongside National Weather Service warnings, storm markers, and wind and winter alerts. Lightning is shown
            for the live radar only, not for past scans.
          </p>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-semibold text-white">Where the lightning data comes from</h2>
          <p className="mt-2 text-slate-300 leading-relaxed max-w-3xl">
            The flashes come from the Geostationary Lightning Mapper (GLM), an instrument on NOAA&apos;s GOES-19 and GOES-18
            satellites that watches the Americas from about 22,000 miles up. It detects total lightning, both in-cloud and
            cloud-to-ground, by spotting the brief flash of light at the cloud tops, day and night. Weather Spectrum reads
            NOAA&apos;s public GLM data as it is published and adds new flashes to the map about once a minute.
          </p>
          <p className="mt-3 text-slate-300 leading-relaxed max-w-3xl">
            Satellite lightning is a picture of where storms are electrically active, not a list of exact ground strikes. Each
            GLM pixel is 8 to 14 km wide, flash positions are typically within about 5 km near the center of the
            satellite&apos;s view and less precise toward the edge, and some flashes are missed.
          </p>
        </section>

        <section className="mt-12 rounded-2xl border border-amber-400/30 bg-amber-400/5 p-5">
          <h2 className="text-lg font-semibold text-amber-200">Lightning safety</h2>
          <p className="mt-2 text-slate-300 leading-relaxed max-w-3xl">
            Lightning can strike miles away from the rain, and the map can lag behind what is happening overhead. If you can
            hear thunder, you are close enough to be struck: go indoors. See the National Weather Service&apos;s{' '}
            <a href="https://www.weather.gov/safety/lightning" className="text-sky-300 hover:text-sky-200" target="_blank" rel="noopener noreferrer">
              lightning safety guide
            </a>
            .
          </p>
        </section>

        <section className="mt-12 border-t border-white/10 pt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">More radar</h2>
          <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
            <li><Link to="/radar" className="text-sky-300 hover:text-sky-200">Live NEXRAD radar</Link></li>
            <li><Link to="/events" className="text-sky-300 hover:text-sky-200">Tornado radar replays</Link></li>
            <li><Link to="/tornado-warnings" className="text-sky-300 hover:text-sky-200">Tornado warnings by year</Link></li>
          </ul>
        </section>
      </div>
    </div>
  );
}
