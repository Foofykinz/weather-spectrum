import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  FIRST_YEAR, STATES, loadTornadoWarnings, periodFromParams, periodToParams, periodLabel, periodInRange, shiftPeriod, sundayOf, summarize,
} from '../warnings/history';
import OFFICES from '../warnings/wfo-names.json';

const TornadoWarningMap = lazy(() => import('../components/seo/TornadoWarningMap'));

// Every NWS tornado warning issued nationwide in a year, month or week.
const OUTSIDE = { SJU: 'TJSJ', HFO: 'PHFO', GUM: 'PGUM', AFC: 'PAFC', AFG: 'PAFG', AJK: 'PAJK' };
const office = (id) => OFFICES[id] || OFFICES[OUTSIDE[id]] || id;
const RADAR_ARCHIVE_FROM = new Date('2009-01-01T00:00:00Z'); // the radar page's Past archive (src/radar/archive.js)
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const when = (d) => d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
const clock = (d) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
const radarLink = (w) =>
  w.issued >= RADAR_ARCHIVE_FROM
    ? `/radar?time=${w.issued.toISOString().slice(0, 16)}Z&at=${w.center[0].toFixed(2)},${w.center[1].toFixed(2)},9`
    : null;
const PAGE = 100;

export default function TornadoWarnings() {
  const [params, setParams] = useSearchParams();
  const now = useMemo(() => new Date(), []);
  const period = useMemo(() => periodFromParams(params, now), [params, now]);
  const state = STATES[params.get('state')] ? params.get('state') : '';
  const [data, setData] = useState({ status: 'idle' });
  const [focus, setFocus] = useState(null);
  const [shown, setShown] = useState(PAGE);
  const label = periodLabel(period);
  const valid = periodInRange(period, now);

  const go = (p, extra = {}) => {
    const next = { ...periodToParams(p), ...(state ? { state } : {}), ...extra };
    Object.keys(next).forEach((k) => next[k] === '' && delete next[k]);
    setParams(next, { replace: true });
  };

  useEffect(() => {
    if (!valid) return undefined;
    let alive = true;
    setData({ status: 'loading' });
    setFocus(null);
    setShown(PAGE);
    loadTornadoWarnings(period, now).then(
      (list) => alive && setData({ status: 'ok', list }),
      (error) => alive && setData({ status: 'error', error })
    );
    return () => {
      alive = false;
    };
  }, [period, now, valid]);

  const all = data.status === 'ok' ? data.list : null;
  const list = useMemo(() => (all && state ? all.filter((w) => w.states.includes(state)) : all), [all, state]);
  const stats = useMemo(() => (list ? summarize(list, period) : null), [list, period]);
  const allStates = useMemo(() => (all ? summarize(all, period).byState : []), [all, period]);
  const max = stats ? Math.max(1, ...stats.bars.map((b) => b.count)) : 1;

  const popupHtml = useCallback((w) => {
    const radar = radarLink(w);
    return `<div style="font:13px/1.4 system-ui,sans-serif">
      <div style="font-weight:700;color:#b91c1c">Tornado Warning #${w.eventid}</div>
      <div>NWS ${esc(office(w.wfo))}</div>
      <div style="margin-top:4px">${esc(w.locations)}</div>
      <div style="margin-top:4px;color:#475569">Issued ${esc(when(w.issued))}<br/>Until ${esc(clock(w.expires))}</div>
      <div style="margin-top:6px">${radar ? `<a href="${radar}">Radar at this time</a> · ` : ''}<a href="${w.link}" target="_blank" rel="noopener">Warning text</a></div>
    </div>`;
  }, []);

  // Switching between year / month / week keeps roughly the same time.
  const switchTo = (kind) => {
    const p = period;
    const year = p.kind === 'week' ? Number(p.start.slice(0, 4)) : p.year;
    const month = p.kind === 'month' ? p.month : p.kind === 'week' ? Number(p.start.slice(5, 7)) : year === now.getFullYear() ? now.getMonth() + 1 : 5;
    if (kind === 'year') go({ kind, year });
    if (kind === 'month') go({ kind, year, month });
    if (kind === 'week') {
      const first = year === now.getFullYear() && month === now.getMonth() + 1 ? sundayOf(now) : sundayOf(new Date(year, month - 1, 1));
      go({ kind, start: `${first.getFullYear()}-${pad(first.getMonth() + 1)}-${pad(first.getDate())}` });
    }
  };
  const prev = shiftPeriod(period, -1);
  const next = shiftPeriod(period, 1);
  const years = [];
  for (let y = now.getFullYear(); y >= FIRST_YEAR; y--) years.push(y);

  const select = 'rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100';
  return (
    <div className="bg-gradient-to-b from-slate-900 to-slate-950">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <nav aria-label="Breadcrumb" className="text-xs text-slate-400">
          <Link to="/" className="hover:text-white">Home</Link> <span aria-hidden>/</span> Tornado warnings
        </nav>
        <h1 className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight text-white">Tornado Warnings by Year, Month or Week</h1>
        <p className="mt-3 max-w-3xl leading-relaxed text-slate-300">
          Every tornado warning the National Weather Service issued across the United States in any year, month or week since {FIRST_YEAR}, on a map,
          with counts by state and office. Click a warning for its counties and times, and open the radar from that moment.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <div className="flex rounded-lg border border-slate-700 bg-slate-900 p-0.5" role="group" aria-label="Period">
            {['year', 'month', 'week'].map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => switchTo(k)}
                aria-pressed={period.kind === k}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold capitalize ${period.kind === k ? 'bg-amber-500 text-slate-900' : 'text-slate-300 hover:text-white'}`}
              >
                {k}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => go(prev)}
              disabled={!periodInRange(prev, now)}
              aria-label="Previous period"
              className="rounded-md border border-slate-700 bg-slate-900 p-1.5 text-slate-200 hover:bg-slate-800 disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {period.kind === 'week' ? (
              <input
                type="date"
                aria-label="Week starting"
                value={period.start}
                min={`${FIRST_YEAR}-01-01`}
                max={now.toISOString().slice(0, 10)}
                onChange={(e) => e.target.value && go({ kind: 'week', start: e.target.value }, {})}
                className={select}
              />
            ) : (
              <>
                {period.kind === 'month' && (
                  <select aria-label="Month" value={period.month} onChange={(e) => go({ ...period, month: Number(e.target.value) })} className={select}>
                    {MONTHS.map((m, i) => (
                      <option key={m} value={i + 1}>{m}</option>
                    ))}
                  </select>
                )}
                <select aria-label="Year" value={period.year} onChange={(e) => go({ ...period, year: Number(e.target.value) })} className={select}>
                  {years.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </>
            )}
            <button
              type="button"
              onClick={() => go(next)}
              disabled={!periodInRange(next, now)}
              aria-label="Next period"
              className="rounded-md border border-slate-700 bg-slate-900 p-1.5 text-slate-200 hover:bg-slate-800 disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <select aria-label="State" value={state} onChange={(e) => go(period, { state: e.target.value })} className={select}>
            <option value="">All states</option>
            {allStates.map(([s, n]) => (
              <option key={s} value={s}>{STATES[s]} ({n})</option>
            ))}
          </select>
        </div>

        <h2 className="mt-6 text-xl font-semibold text-white">
          Tornado warnings, {label}{state ? `, ${STATES[state]}` : ''}
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Warnings issued', list ? list.length.toLocaleString() : '…'],
            ['States', stats ? (state ? STATES[state] : stats.byState.length) : '…'],
            ['Busiest day', stats?.busiestDay ? `${new Date(stats.busiestDay.day + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} (${stats.busiestDay.count})` : list ? 'None' : '…'],
            ['Busiest office', stats?.byOffice[0] ? `${office(stats.byOffice[0][0])} (${stats.byOffice[0][1]})` : list ? 'None' : '…'],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-slate-400">{k}</div>
              <div className="mt-1 text-lg font-semibold text-white">{v}</div>
            </div>
          ))}
        </div>

        <div className="relative mt-4 h-[55vh] min-h-[320px] overflow-hidden rounded-2xl border border-white/10">
          {typeof window !== 'undefined' && (
            <Suspense fallback={null}>
              <TornadoWarningMap warnings={list || []} popupHtml={popupHtml} focus={focus} fit={!!state} />
            </Suspense>
          )}
          {data.status !== 'ok' && (
            <div className="absolute inset-x-0 top-3 z-[1000] mx-auto w-fit rounded-lg border border-slate-700 bg-slate-900/90 px-3 py-1.5 text-sm text-slate-200">
              {!valid
                ? `There are no warnings in the archive for ${label}.`
                : data.status === 'error'
                  ? `The warning archive couldn't load: ${data.error?.message}`
                  : `Loading the tornado warnings for ${label}…`}
            </div>
          )}
        </div>

        {stats && list.length > 0 && (
          <>
            <h3 className="mt-8 text-lg font-semibold text-white">{period.kind === 'year' ? 'By month' : 'By day'}</h3>
            <div className="mt-3 flex h-40 items-end gap-1 rounded-xl border border-white/10 bg-slate-900/60 p-3" role="list">
              {stats.bars.map((b) => (
                <div key={b.title} role="listitem" title={`${b.title}: ${b.count}`} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
                  <span className="text-[10px] tabular-nums text-slate-300">{b.count || ''}</span>
                  <div className="w-full rounded-t bg-red-500/80" style={{ height: `${(b.count / max) * 80}%`, minHeight: b.count ? 2 : 0 }} />
                  <span className="mt-1 text-[10px] text-slate-400">{b.label}</span>
                </div>
              ))}
            </div>

            <div className="mt-8 grid gap-6 sm:grid-cols-2">
              {!state && (
                <div>
                  <h3 className="text-lg font-semibold text-white">Most warnings by state</h3>
                  <ol className="mt-2 space-y-1 text-sm">
                    {stats.byState.slice(0, 10).map(([s, n]) => (
                      <li key={s} className="flex justify-between gap-3 border-b border-white/5 py-1">
                        <button type="button" onClick={() => go(period, { state: s })} className="text-left text-amber-300 hover:text-amber-200">{STATES[s]}</button>
                        <span className="tabular-nums text-slate-300">{n}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              <div>
                <h3 className="text-lg font-semibold text-white">Most warnings by NWS office</h3>
                <ol className="mt-2 space-y-1 text-sm">
                  {stats.byOffice.slice(0, 10).map(([o, n]) => (
                    <li key={o} className="flex justify-between gap-3 border-b border-white/5 py-1 text-slate-200">
                      <span>{office(o)} <span className="text-slate-500">({o})</span></span>
                      <span className="tabular-nums text-slate-300">{n}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            <h3 className="mt-8 text-lg font-semibold text-white">All warnings ({list.length.toLocaleString()}, newest first)</h3>
            <ul className="mt-2 divide-y divide-white/5 rounded-xl border border-white/10 bg-slate-900/60 text-sm">
              {list.slice(0, shown).map((w) => {
                const radar = radarLink(w);
                return (
                  <li key={w.key} className="flex flex-col gap-1 px-4 py-2 sm:flex-row sm:items-center sm:gap-4">
                    <span className="shrink-0 tabular-nums text-slate-300 sm:w-56">{when(w.issued)}</span>
                    <span className="min-w-0 flex-1 text-slate-100">
                      {w.locations} <span className="text-slate-500">· NWS {office(w.wfo)}</span>
                    </span>
                    <span className="flex shrink-0 gap-3 text-xs">
                      <button type="button" onClick={() => setFocus(w.key)} className="text-amber-300 hover:text-amber-200">Map</button>
                      {radar && <a href={radar} className="text-amber-300 hover:text-amber-200">Radar</a>}
                      <a href={w.link} target="_blank" rel="noopener noreferrer" className="text-amber-300 hover:text-amber-200">Text</a>
                    </span>
                  </li>
                );
              })}
            </ul>
            {shown < list.length && (
              <button
                type="button"
                onClick={() => setShown((n) => n + PAGE)}
                className="mt-3 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm font-semibold text-slate-200 hover:bg-slate-800"
              >
                Show {Math.min(PAGE, list.length - shown)} more
              </button>
            )}
          </>
        )}
        {stats && list.length === 0 && <p className="mt-6 text-slate-300">No tornado warnings were issued{state ? ` in ${STATES[state]}` : ''} in {label}.</p>}

        <p className="mt-10 max-w-3xl text-xs leading-relaxed text-slate-500">
          Source: National Weather Service tornado warnings as archived by the{' '}
          <a href="https://mesonet.agron.iastate.edu/" target="_blank" rel="noopener noreferrer" className="text-slate-400 underline">Iowa Environmental Mesonet</a>.
          Each warning is shown with the area it covered when first issued. Times, and where each day, week and month begins, follow your time zone. A tornado warning means a tornado was
          observed or indicated by radar, not that one was confirmed: these are warnings, not tornado reports. A warning that covers two states counts once
          in each. The Radar link opens the archived radar (available from 2009) at the time the warning was issued.
        </p>
      </div>
    </div>
  );
}
