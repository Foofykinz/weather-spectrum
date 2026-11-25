import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ImagePlus } from 'lucide-react';
import { lazyPage } from '../utils/lazyPage';
import { stateName } from '../seo/places';
import SUMMARY from '../seo/climatology-summary.json';

const ClimatologyMap = lazyPage(() => import('../components/seo/ClimatologyMap'));
const ClimatologyPost = lazyPage(() => import('../components/seo/ClimatologyPost'));

// Tornado, hail and damaging wind climatology by month (SPC database,
// 1996-2025). Every number on this page comes from
// scripts/build-climatology.mjs; the map shapes load from
// public/data/climatology/<hazard>.json.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const HAZARDS = {
  tornado: {
    tab: 'Tornadoes',
    title: 'Average Tornado Risk Area',
    noun: 'tornadoes',
    one: 'tornado',
    colors: { typical: '#e5181b', greater: '#8f0f0f' },
  },
  hail: {
    tab: 'Large hail',
    title: 'Average Large Hail Risk Area',
    noun: 'large hail reports (1 inch or larger)',
    one: 'large hail report',
    colors: { typical: '#16a34a', greater: '#14532d' },
  },
  wind: {
    tab: 'Damaging wind',
    title: 'Average Damaging Wind Risk Area',
    noun: 'damaging wind reports',
    one: 'damaging wind report',
    colors: { typical: '#2563eb', greater: '#1e3a8a' },
  },
};
const [FIRST, LAST] = SUMMARY.years;
const fmt = (n) => (n >= 100 ? Math.round(n).toLocaleString('en-US') : String(n));

function useShapes(hazard) {
  const [data, setData] = useState({});
  useEffect(() => {
    if (data[hazard]) return undefined;
    let alive = true;
    fetch(`/data/climatology/${hazard}.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
      .then((j) => alive && setData((d) => ({ ...d, [hazard]: j })))
      .catch(() => alive && setData((d) => ({ ...d, [hazard]: 'error' })));
    return () => {
      alive = false;
    };
  }, [hazard, data]);
  return data[hazard];
}

export default function TornadoSeason() {
  const [params, setParams] = useSearchParams();
  const hazard = HAZARDS[params.get('h')] ? params.get('h') : 'tornado';
  const m = Number(params.get('m'));
  const month = m >= 1 && m <= 12 ? m - 1 : new Date().getMonth();
  const h = HAZARDS[hazard];
  const stats = SUMMARY[hazard];
  const shapes = useShapes(hazard);
  const [post, setPost] = useState(false);
  const set = (changes) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v == null) next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  };

  const max = Math.max(...stats.map((s) => s.perYear));
  const ranked = useMemo(
    () =>
      SUMMARY.tornado
        .map((s, i) => [i, s.perYear])
        .sort((a, b) => b[1] - a[1]),
    []
  );
  const sel = stats[month];
  const name = MONTHS[month];

  return (
    <div className="bg-gradient-to-b from-slate-900 to-slate-950">
      <div className="max-w-5xl mx-auto px-5 sm:px-6 py-10 sm:py-14">
        <nav aria-label="Breadcrumb" className="text-xs text-slate-400">
          <Link to="/" className="hover:text-white">Home</Link> <span aria-hidden>/</span> Tornado season by month
        </nav>
        <h1 className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight text-white">Tornado Season by Month</h1>
        <p className="mt-3 text-slate-300 leading-relaxed max-w-3xl">
          Where tornadoes, large hail and damaging winds happen most in each month of the year, mapped from {LAST - FIRST + 1} years of
          NOAA storm records ({FIRST} to {LAST}) across the lower 48 states. Pick a month to see its usual risk area.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-slate-700 p-0.5" role="radiogroup" aria-label="Type of severe weather">
          {Object.entries(HAZARDS).map(([id, x]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={hazard === id}
              onClick={() => set({ h: id === 'tornado' ? null : id })}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold ${hazard === id ? 'bg-sky-400/20 text-sky-200' : 'text-slate-300 hover:bg-slate-800'}`}
            >
              {x.tab}
            </button>
          ))}
        </div>
          <button
            type="button"
            disabled={!shapes || shapes === 'error'}
            onClick={() => setPost(true)}
            className="inline-flex items-center gap-2 rounded-lg ws-spectrum px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"
          >
            <ImagePlus className="h-4 w-4" aria-hidden /> Make a post
          </button>
        </div>

        <div className="mt-4 grid grid-cols-12 gap-1 sm:gap-1.5" role="radiogroup" aria-label="Month">
          {stats.map((s, i) => (
            <button
              key={MONTHS[i]}
              type="button"
              role="radio"
              aria-checked={i === month}
              aria-label={`${MONTHS[i]}: ${fmt(s.perYear)} ${h.noun} a year on average`}
              onClick={() => set({ m: String(i + 1) })}
              className={`group flex flex-col items-center rounded-md px-0.5 pt-1.5 pb-1 ${i === month ? 'bg-white/10 ring-1 ring-white/30' : 'hover:bg-white/5'}`}
            >
              <span className="flex h-14 w-full items-end justify-center sm:h-16">
                <span
                  className="w-3/5 max-w-[22px] rounded-t-sm"
                  style={{ height: `${Math.max(4, (s.perYear / max) * 100)}%`, background: i === month ? h.colors.typical : '#475569' }}
                />
              </span>
              <span className={`mt-1 text-[11px] font-semibold sm:text-xs ${i === month ? 'text-white' : 'text-slate-400'}`}>{MONTHS[i].slice(0, 3)}</span>
            </button>
          ))}
        </div>

        <div className="relative isolate mt-4 h-[420px] sm:h-[540px] overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f17]">
          <Suspense fallback={null}>
            <ClimatologyMap month={shapes && shapes !== 'error' ? shapes.months[month] : null} colors={h.colors} />
          </Suspense>
          <div className="pointer-events-none absolute left-2 top-2 z-[1000] rounded-lg border border-slate-700/80 bg-slate-900/90 px-3 py-2">
            <div className="text-sm font-semibold text-white">
              Where {name} {h.noun.split(' (')[0]} happen
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-300">
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-4 rounded-sm" style={{ background: h.colors.greater }} aria-hidden /> Greater: the core, about a third of reports
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-4 rounded-sm" style={{ background: h.colors.typical }} aria-hidden /> Typical: three quarters of reports
              </span>
            </div>
          </div>
          {shapes === 'error' && (
            <div className="absolute inset-x-0 bottom-3 z-[1000] text-center text-sm text-red-300">The map areas couldn&apos;t load. Reload to try again.</div>
          )}
        </div>

        <section className="mt-6 rounded-2xl border border-white/10 bg-slate-900/60 p-5">
          <h2 className="text-lg font-semibold text-white">{name}</h2>
          <p className="mt-1 text-slate-300">
            An average of <span className="font-semibold text-white">{fmt(sel.perYear)}</span> {h.noun} a year in {name} ({FIRST} to {LAST}).
          </p>
          {sel.states.length > 0 && (
            <p className="mt-2 text-sm text-slate-400">
              Most in {name}:{' '}
              {sel.states.map(([st, n], i) => (
                <span key={st}>
                  {i > 0 && ', '}
                  {stateName(st)} ({fmt(n)} a year)
                </span>
              ))}
              .
            </p>
          )}
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-semibold text-white">When is tornado season?</h2>
          <p className="mt-2 text-slate-300 leading-relaxed max-w-3xl">
            Tornadoes happen in every month of the year somewhere in the United States. From {FIRST} to {LAST}, {MONTHS[ranked[0][0]]} was the
            busiest month, with an average of {fmt(ranked[0][1])} tornadoes a year, followed by {MONTHS[ranked[1][0]]} ({fmt(ranked[1][1])}) and{' '}
            {MONTHS[ranked[2][0]]} ({fmt(ranked[2][1])}). The quietest month was {MONTHS[ranked[11][0]]}, with {fmt(ranked[11][1])}.
          </p>
          <p className="mt-3 text-slate-300 leading-relaxed max-w-3xl">
            The area at risk moves through the year. Flip through the months above to see it: in winter, tornadoes are most common across the
            Gulf Coast states and the Southeast; through spring the risk spreads north across the Plains and the Mississippi and Ohio valleys;
            by midsummer it sits over the northern Plains and Upper Midwest; in September Florida and the Carolinas see the most; and in late
            fall it returns to the South.
          </p>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-semibold text-white">How these maps are made</h2>
          <ul className="mt-3 max-w-3xl list-disc space-y-2 pl-5 text-slate-300 leading-relaxed">
            <li>
              The data is the Storm Prediction Center&apos;s severe weather database (NOAA/NWS), built from National Weather Service storm
              reports: every tornado, hail and damaging wind report in the lower 48 states from {FIRST} to {LAST}. Tornadoes are placed where
              they touched down.
            </li>
            <li>
              The method follows the one NOAA&apos;s National Severe Storms Laboratory uses for its tornado climatology (Brooks, Doswell
              and Kay, 2003,{' '}
              <a
                href="https://www.nssl.noaa.gov/users/brooks/public_html/papers/tclimdaily.pdf"
                className="text-sky-300 hover:text-sky-200"
                target="_blank"
                rel="noopener noreferrer"
              >
                &ldquo;Climatological estimates of local daily tornado probability for the United States&rdquo;
              </a>
              ): each day, an 80 km (50-mile) box counts once if one or more reports fell in it, so a single large outbreak doesn&apos;t
              outweigh years of ordinary storm days, and the result is smoothed over the map with the same 120 km setting. The paper
              smooths across days of the year; these maps group by calendar month instead.
            </li>
            <li>
              The darker <span className="font-semibold">greater</span> area is the smallest area that holds about a third of the month&apos;s
              activity, and the wider <span className="font-semibold">typical</span> area holds three quarters. Small outlying patches are left
              off so each map shows the main areas. They show where that month&apos;s storms usually
              happen, not how likely one is at a given place: a quiet month and a busy month both have a greater area.
            </li>
            <li>Large hail means 1 inch (quarter size) or larger, the National Weather Service&apos;s severe size since 2010.</li>
            <li>
              Storm reports depend on someone seeing the damage or the storm, so they are more complete near towns and roads. This matters most
              for damaging wind reports.
            </li>
          </ul>
        </section>

        <section className="mt-12 border-t border-white/10 pt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">More from Weather Spectrum</h2>
          <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
            <li><Link to="/radar" className="text-sky-300 hover:text-sky-200">Live NEXRAD radar</Link></li>
            <li><Link to="/tornado-warnings" className="text-sky-300 hover:text-sky-200">Tornado warnings by year</Link></li>
            <li><Link to="/events" className="text-sky-300 hover:text-sky-200">Tornado radar replays</Link></li>
          </ul>
        </section>
      </div>
      {post && shapes && shapes !== 'error' && (
        <Suspense fallback={null}>
          <ClimatologyPost
            key={`${hazard}-${month}`}
            onClose={() => setPost(false)}
            info={{
              title: h.title,
              monthName: name,
              month: shapes.months[month],
              colors: h.colors,
              fileBase: `${hazard}-risk-${name.toLowerCase()}`,
              caption: captionFor(h, name, sel),
            }}
          />
        </Suspense>
      )}
    </div>
  );
}

function captionFor(h, name, sel) {
  const short = h.noun.split(' (')[0];
  const top = sel.states.slice(0, 3).map(([st]) => stateName(st));
  const most = top.length > 1 ? `${top.slice(0, -1).join(', ')} and ${top[top.length - 1]}` : top[0];
  return (
    `Where ${name} ${short} happen most, from ${LAST - FIRST + 1} years of NOAA storm records (${FIRST}-${LAST}). ` +
    `An average of ${fmt(sel.perYear)} ${h.noun} a year in ${name}` +
    (most ? `, most in ${most}.` : '.') +
    `

See every month: theweatherspectrum.com/tornado-season`
  );
}
