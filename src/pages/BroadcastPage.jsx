import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Sun, Moon, Cloud, CloudSun, CloudMoon, CloudRain, CloudDrizzle, CloudLightning, CloudSnow, CloudFog, Wind, Snowflake } from 'lucide-react';
import RadarMap from '../components/radar/RadarMap';
import { getProduct } from '../radar/products';
import N0Q_PALETTE from '../radar/data/iem-n0q-palette.json';
import { useRadarFrame } from '../radar/useRadarFrame';
import { subscribeWarnings, loadHistory } from '../radar/providers/warnings';
import EventView from '../components/broadcast/EventView';
import { isEventWorthy, sortEvents, boundsOf } from '../broadcast/event';
import { nearestStation } from '../radar/stations';
import { fetchOutlook, CATEGORIES, DEFAULT_FILL } from '../broadcast/spc';
import { warningName, bannerText, bannerTime, zoneForStation } from '../radar/post';
import { TOUR } from '../broadcast/cities';
import { cityWeather } from '../broadcast/nws';

// 24/7 broadcast page, made to be captured by OBS as a 1920x1080 browser
// source. Runs itself: flies from city to city showing radar, current
// conditions and the 5-day forecast, with a warning crawl along the bottom.
// All data is live NOAA / NWS data; anything missing is skipped, not filled in.

const W = 1920;
const H = 1080;
const BAR = 112; // bottom bar height
const SEGMENTS = [
  { id: 'fly', ms: 6000, label: 'Now Heading To' },
  { id: 'radar', ms: 12000, label: 'Local Radar' },
  { id: 'now', ms: 10000, label: 'Current Conditions' },
  { id: 'forecast', ms: 13000, label: '5-Day Forecast' },
];
const ZOOM = 8;
const EVENT_MS = 25000; // time on each warning in event mode
// Warning check-in: every CHECKIN_EVERY cities, if severe thunderstorm, flash
// flood or snow squall warnings are in effect, show the top few on the warning
// screen (tornado warnings and the most dangerous ones take over anyway).
const CHECKIN_EVERY = 5;
const CHECKIN_MAX = 3;
const CHECKIN_MS = 20000;
const CHECKIN_PHEN = new Set(['SV', 'FF', 'SQ']);
// SPC outlook stop: every 10 cities, Days 1-3, 12 seconds each, over a
// whole-country view (shifted east so the panel on the left doesn't cover it).
const OUTLOOK_EVERY = 10;
const OUTLOOK_MS = 12000;
const US_VIEW = { lat: 38.3, lon: -108.6, zoom: 4.8 };
const SPC_TZ = 'America/Chicago';
// TV-style radar: hide weak returns (clutter, insects, noise) below this many
// dBZ. Light rain and most light snow are above it.
const HIDE_BELOW_DBZ = 10;
// IEM's palette has one unique color per 0.5 dBZ step (index i -> -32 + 0.5(i-1)),
// so "below the threshold" is an exact list of colors.
const WEAK_COLORS = new Set(
  N0Q_PALETTE.colors.slice(1, 1 + (HIDE_BELOW_DBZ + 32) / 0.5).map((c) => parseInt(c.slice(1), 16))
);
const radarLayer = (t) => ({ ...product.layer(null, t), hideColors: WEAK_COLORS });
const LOOP_FRAMES = 8;
const LOOP_MS = 500;
const LOOP_HOLD = 4; // extra ticks on the newest image
const RELOAD_MS = 6 * 3600e3; // fresh start every few hours keeps a 24/7 page healthy
const START = Date.now();
const KEY = 'ws-broadcast-city';
const product = getProduct('mosaic-reflectivity');
const noop = () => {};
const FONT = '"Barlow Condensed", "Arial Narrow", Arial, sans-serif';
const shadow = { textShadow: '2px 2px 0 rgba(0,0,0,0.55)' };

function useFonts() {
  useEffect(() => {
    if (document.getElementById('ws-broadcast-font')) return;
    const l = document.createElement('link');
    l.id = 'ws-broadcast-font';
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&display=swap';
    document.head.appendChild(l);
  }, []);
}

// Scale the 1920x1080 stage to fit the window (OBS uses exactly 1920x1080).
function useStageScale() {
  const [s, setS] = useState(1);
  useEffect(() => {
    const fit = () => setS(Math.min(window.innerWidth / W, window.innerHeight / H));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return s;
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const fmt = (d, tz, opts) => d.toLocaleString('en-US', { timeZone: tz || undefined, ...opts });
const timeIn = (d, tz) => fmt(d, tz, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });

function iconFor(text, day = true) {
  const t = String(text || '').toLowerCase();
  if (/thunder|t-storm/.test(t)) return CloudLightning;
  if (/snow|flurr|sleet|blizzard/.test(t)) return /heavy|blizzard/.test(t) ? Snowflake : CloudSnow;
  if (/drizzle/.test(t)) return CloudDrizzle;
  if (/rain|shower/.test(t)) return CloudRain;
  if (/fog|haze|smoke|mist/.test(t)) return CloudFog;
  if (/wind|breezy|blustery/.test(t)) return Wind;
  if (/partly|mostly sunny|mostly clear|few clouds/.test(t)) return day ? CloudSun : CloudMoon;
  if (/cloud|overcast/.test(t)) return Cloud;
  return day ? Sun : Moon;
}

// Download the radar map squares the next city will need, for every loop
// frame, while the current city is on screen. When the camera lands, the
// browser already has them, so the radar appears whole instead of square by
// square. Same squares the map would load anyway, just earlier.
const prefetched = [];
function prefetchRadar(specs, city) {
  const z = Math.min(ZOOM, product.maxNativeZoom || ZOOM);
  // Web Mercator pixel position of the city at zoom z (the map's own projection).
  const size = 256 * 2 ** z;
  const lat = (city.lat * Math.PI) / 180;
  const p = { x: ((city.lon + 180) / 360) * size, y: ((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * size };
  const half = { x: W / 2, y: (H - BAR) / 2 };
  const [x0, x1] = [Math.floor((p.x - half.x) / 256), Math.floor((p.x + half.x) / 256)];
  const [y0, y1] = [Math.floor((p.y - half.y) / 256), Math.floor((p.y + half.y) / 256)];
  prefetched.length = 0; // let the previous batch go
  for (const spec of specs) {
    if (spec.kind !== 'xyz') continue;
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const img = new Image();
        img.crossOrigin = 'anonymous'; // same request mode as the map's own tiles, so the cached copy is reused
        img.src = spec.url.replace('{s}', '').replace('{z}', z).replace('{x}', x).replace('{y}', y);
        prefetched.push(img);
      }
    }
  }
}

// ---------- pieces

function Panel({ title, className = '', style, children }) {
  return (
    <div
      className={`absolute overflow-hidden rounded-md ${className}`}
      style={{
        background: 'linear-gradient(180deg, #1d3275 0%, #12204f 55%, #0c1638 100%)',
        border: '2px solid #4f68b8',
        borderRightColor: '#0a1230',
        borderBottomColor: '#0a1230',
        boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
        ...style,
      }}
    >
      <div className="h-2" style={{ background: 'linear-gradient(90deg, #1d4ed8, #06b6d4, #22c55e, #facc15, #f97316, #dc2626)' }} />
      {title && (
        <div className="px-6 py-2 text-[34px] font-bold uppercase tracking-wide text-[#0b1530]" style={{ background: 'linear-gradient(90deg, #38bdf8, #7dd3fc)' }}>
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

function TitlePlate({ label, city, sub }) {
  return (
    <div className="absolute left-10 top-9" style={shadow}>
      <div className="inline-block px-5 py-1 text-[30px] font-bold uppercase tracking-wider text-[#0b1530]" style={{ background: 'linear-gradient(90deg, #38bdf8, #7dd3fc)' }}>
        {label}
      </div>
      <div className="mt-1 px-5 py-2 text-[64px] font-bold uppercase leading-none text-white" style={{ background: 'rgba(12,22,56,0.88)', borderLeft: '6px solid #38bdf8' }}>
        {city}
        {sub && <span className="ml-4 text-[34px] font-semibold normal-case text-sky-300">{sub}</span>}
      </div>
    </div>
  );
}

function Conditions({ obs, tz }) {
  const Icon = iconFor(obs.text, true);
  const rows = [
    ['Feels like', obs.feels != null ? `${obs.feels}°` : null],
    ['Humidity', obs.humidity != null ? `${obs.humidity}%` : null],
    ['Dew point', obs.dew != null ? `${obs.dew}°` : null],
    ['Wind', obs.wind != null ? (obs.wind === 0 ? 'Calm' : `${obs.windDir || ''} ${obs.wind} mph${obs.gust ? `, gusts ${obs.gust}` : ''}`.trim()) : null],
    ['Pressure', obs.pressure ? `${obs.pressure} in` : null],
    ['Visibility', obs.visibility != null ? `${obs.visibility} mi` : null],
  ].filter(([, v]) => v);
  return (
    <Panel className="ws-bc-in" style={{ left: 1110, top: 170, width: 770, height: 640 }}>
      <div className="flex items-center gap-8 px-8 pt-6" style={shadow}>
        <Icon className="h-36 w-36 text-sky-300" strokeWidth={1.6} />
        <div>
          <div className="text-[150px] font-bold leading-none text-white">{obs.temp != null ? `${obs.temp}°` : '--'}</div>
          <div className="mt-1 text-[40px] font-semibold text-sky-200">{obs.text || ''}</div>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-x-10 gap-y-2 px-8 text-[34px]" style={shadow}>
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between border-b border-white/10 pb-1">
            <span className="text-slate-300">{k}</span>
            <span className="font-semibold text-white">{v}</span>
          </div>
        ))}
      </div>
      <div className="absolute bottom-3 left-8 text-[24px] text-slate-400">
        Observed {timeIn(obs.time, tz)}
        {obs.station ? ` at ${obs.station}` : ''}
      </div>
    </Panel>
  );
}

function Forecast({ days }) {
  return (
    <Panel className="ws-bc-in" style={{ left: 40, top: 520, width: 1840, height: 420 }}>
      <div className="grid h-[400px] grid-cols-5" style={shadow}>
        {days.map((d, i) => {
          const Icon = iconFor(d.text, d.day);
          return (
            <div key={i} className={`flex flex-col items-center px-4 pt-4 text-center ${i ? 'border-l border-white/15' : ''}`}>
              <div className="text-[42px] font-bold uppercase text-sky-300">{d.name}</div>
              <Icon className="my-2 h-24 w-24 text-white" strokeWidth={1.6} />
              <div className="flex h-[84px] items-center text-[30px] font-semibold leading-tight text-slate-100">{d.text}</div>
              <div className="mt-2 text-[52px] font-bold leading-none">
                {d.hi != null && <span className="text-white">{`${d.hi}°`}</span>}
                {d.hi != null && d.lo != null && <span className="text-slate-500"> / </span>}
                {d.lo != null && <span className="text-sky-300">{`${d.lo}°`}</span>}
              </div>
              {d.pop ? <div className="mt-2 text-[28px] font-semibold text-cyan-300">{d.pop}% precip</div> : null}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

// Warning crawl: the text only changes between passes, so nothing jumps.
function Crawl({ text }) {
  const [shown, setShown] = useState(text);
  const latest = useRef(text);
  latest.current = text;
  // The loading message is replaced right away; real text waits for the pass to end.
  if (shown !== text && /^Loading/.test(shown)) setShown(text);
  const ref = useRef(null);
  const [dur, setDur] = useState(60);
  useEffect(() => {
    const w = ref.current?.scrollWidth || 2000;
    setDur((w + 1300) / 130); // 130 px per second
  }, [shown]);
  return (
    <div className="relative h-full flex-1 overflow-hidden" style={{ background: '#0b1530' }}>
      <div
        key={shown}
        ref={ref}
        className="ws-bc-crawl absolute top-1/2 whitespace-pre text-[40px] font-semibold text-sky-200"
        style={{ animationDuration: `${dur}s`, ...shadow }}
        onAnimationIteration={() => latest.current !== shown && setShown(latest.current)}
      >
        {shown}
      </div>
    </div>
  );
}

function crawlText(state) {
  if (!state) return 'Loading warnings from the National Weather Service...';
  if (state.error && !state.warnings?.length) return 'Warning data is temporarily unavailable. Official warnings: weather.gov';
  const ws = state.warnings || [];
  const counts = new Map();
  for (const w of ws) counts.set(w.type.event, (counts.get(w.type.event) || 0) + 1);
  const head = ws.length
    ? `Active warnings nationwide: ${[...counts].map(([k, n]) => `${n} ${k}${n === 1 ? '' : 's'}`).join(', ')}`
    : 'No polygon warnings in effect nationwide right now';
  const listed = [...ws]
    .filter((w) => w.type.phen !== 'FA')
    .sort((a, b) => (a.danger === 'emergency' ? -2 : a.danger === 'high' ? -1 : 0) - (b.danger === 'emergency' ? -2 : b.danger === 'high' ? -1 : 0) || a.type.rank - b.type.rank)
    .slice(0, 20)
    .map((w) => {
      const st = (w.area || '').match(/,\s*([A-Z]{2})\b/)?.[1] || nearestStation(...boundsOf(w.geometry).center)?.state;
      const where = bannerText(w);
      return `${warningName(w)}${where ? `: ${where}` : ''} ${bannerTime(w, zoneForStation({ state: st }))}`.trim();
    });
  return [head, ...listed, 'Unofficial broadcast. Always follow official warnings: weather.gov'].join('      •      ');
}

const DAY_NAME = { 1: 'Day 1 · Today', 2: 'Day 2 · Tomorrow', 3: 'Day 3' };

function OutlookPanel({ data }) {
  const top = data?.top;
  const severe = top && top.level >= 1;
  const color = (id) => data?.features.find((f) => f.properties.LABEL === id)?.properties.fill || DEFAULT_FILL[id];
  const when = (d) => (d ? d.toLocaleString('en-US', { timeZone: SPC_TZ, weekday: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : '');
  const prob = (label, p) =>
    p && p.pct > 0 ? (
      <div className="flex justify-between border-b border-white/10 pb-1">
        <span className="text-slate-300">{label}</span>
        <span className="font-semibold text-white">
          up to {p.pct}%{p.significant ? ', significant' : ''}
        </span>
      </div>
    ) : null;
  return (
    <Panel className="ws-bc-in" style={{ left: 40, top: 200, width: 560, height: 700 }}>
      <div className="p-6" style={shadow}>
        {data === undefined && <div className="text-[34px] text-slate-300">Loading the outlook...</div>}
        {data === null && <div className="text-[34px] text-slate-300">Outlook unavailable right now.</div>}
        {data && (
          <>
            <div className="text-[26px] font-semibold uppercase tracking-wide text-sky-300">Highest risk</div>
            {severe ? (
              <div className="mt-1 inline-block px-4 py-1 text-[46px] font-bold leading-tight text-[#0b1530]" style={{ background: color(top.id) }}>
                {top.name} <span className="text-[30px]">({top.level} of 5)</span>
              </div>
            ) : (
              <div className="mt-1 text-[40px] font-bold leading-tight text-white">No severe storms expected</div>
            )}
            {!severe && top && <div className="mt-1 text-[28px] text-slate-200">General thunderstorms possible</div>}
            {data.cities.length > 0 && (
              <div className="mt-3 text-[26px] leading-snug text-slate-100">
                <span className="font-semibold text-sky-200">Includes: </span>
                {data.cities.slice(0, 6).join(' · ')}
                {data.cities.length > 6 ? ' and more' : ''}
              </div>
            )}
            {data.probs && (data.probs.tornado.pct || data.probs.wind.pct || data.probs.hail.pct) ? (
              <div className="mt-4 space-y-1 text-[26px]">
                <div className="text-[20px] uppercase tracking-wide text-slate-400">Chance within 25 miles of a point</div>
                {prob('Tornado', data.probs.tornado)}
                {prob('Damaging wind', data.probs.wind)}
                {prob('Large hail', data.probs.hail)}
              </div>
            ) : null}
            <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-1 text-[22px]">
              {CATEGORIES.map((c) => (
                <div key={c.id} className={`flex items-center gap-2 ${data.features.some((f) => f.properties.LABEL === c.id) ? 'text-white' : 'text-slate-500'}`}>
                  <span className="inline-block h-5 w-5 shrink-0 border border-black/40" style={{ background: color(c.id) }} />
                  {c.level ? `${c.level} ${c.short}` : c.short}
                </div>
              ))}
            </div>
            <div className="absolute bottom-4 left-6 right-6 text-[19px] leading-snug text-slate-400">
              NOAA Storm Prediction Center. Issued {when(data.issued)}; valid {when(data.valid)} to {when(data.expire)}.
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}

// ---------- page

// If anything ever breaks the page, show a holding screen and start fresh,
// so a 24/7 stream never sits on a dead screen.
class Recover extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err) {
    console.error('Broadcast page error, reloading:', err);
    setTimeout(() => window.location.reload(), 10000);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-[#0b1530] text-white" style={{ fontFamily: FONT }}>
        <div className="text-center">
          <div className="text-[64px] font-bold uppercase">Weather Spectrum</div>
          <div className="mt-2 text-[36px] text-sky-300">We&apos;ll be right back</div>
        </div>
      </div>
    );
  }
}

export default function BroadcastPageSafe() {
  return (
    <Recover>
      <BroadcastPage />
    </Recover>
  );
}

function BroadcastPage() {
  useFonts();
  const scale = useStageScale();
  const now = useClock();
  const mapRef = useRef(null);
  const [cityIdx, setCityIdx] = useState(() => {
    try {
      const v = Number(sessionStorage.getItem(KEY));
      return Number.isInteger(v) && v >= 0 && v < TOUR.length ? v : 0;
    } catch {
      return 0;
    }
  });
  const [segIdx, setSegIdx] = useState(0);
  const [weather, setWeather] = useState({}); // city index -> data | 'error'
  const [warnState, setWarnState] = useState(null);
  const frame = useRadarFrame(product, null, undefined);
  const stillTime = frame.status === 'ok' ? frame.validTime.getTime() : 0;
  const stillLayer = useMemo(() => (stillTime ? radarLayer(new Date(stillTime)) : null), [stillTime]);

  // Radar loop: the latest real mosaic images, refreshed every few minutes.
  // A new list replaces the old one only when a newer image exists.
  const [loop, setLoop] = useState(null); // { times, specs }
  const [loopIdx, setLoopIdx] = useState(0);
  // The loop frame really on screen (a frame still loading isn't shown).
  const [shownTime, setShownTime] = useState(null);
  useEffect(() => {
    let ctl;
    const load = async () => {
      ctl?.abort();
      ctl = new AbortController();
      try {
        const times = await product.frames(null, LOOP_FRAMES, ctl.signal);
        if (times.length < 2) return;
        setLoop((old) =>
          old && old.times[old.times.length - 1].getTime() === times[times.length - 1].getTime() ? old : { times, specs: times.map(radarLayer) }
        );
      } catch {
        // keep the current loop; the still image is shown if there is none
      }
    };
    load();
    const id = setInterval(load, 5 * 60e3);
    return () => {
      clearInterval(id);
      ctl?.abort();
    };
  }, []);
  useEffect(() => {
    if (!loop) return undefined;
    let hold = 0;
    const id = setInterval(() => {
      setLoopIdx((i) => {
        const last = loop.times.length - 1;
        if (i < last) return i + 1;
        if (hold++ < LOOP_HOLD) return i;
        hold = 0;
        return 0;
      });
    }, LOOP_MS);
    setLoopIdx(0);
    return () => clearInterval(id);
  }, [loop]);
  const city = TOUR[cityIdx];
  const nextIdx = (cityIdx + 1) % TOUR.length;
  const data = weather[cityIdx];
  const seg = SEGMENTS[segIdx];

  useEffect(() => {
    document.title = 'Weather Spectrum Broadcast';
    try {
      sessionStorage.setItem(KEY, String(cityIdx));
    } catch {
      // ignore
    }
  }, [cityIdx]);
  // Warnings: live, or (?replay=2024-05-07T02:59Z) those in effect at a past
  // moment, to rehearse or demo event mode.
  const replay = useMemo(() => {
    const v = new URLSearchParams(window.location.search).get('replay');
    const d = v ? new Date(/T\d{2}:\d{2}Z$/.test(v) ? v.replace('Z', ':00Z') : v) : null;
    return d && !Number.isNaN(d.getTime()) && d < new Date() ? d : null;
  }, []);
  useEffect(() => {
    if (!replay) return subscribeWarnings(setWarnState);
    const c = new AbortController();
    loadHistory([replay], c.signal)
      .then((h) => setWarnState(h.get(replay.getTime())))
      .catch(() => setWarnState({ warnings: [], error: true }));
    return () => c.abort();
  }, [replay]);

  // ---- Event mode: the serious warnings take over, one at a time.
  // ?event=all puts every active warning through event mode (for testing with live data).
  const eventFilter = new URLSearchParams(window.location.search).get('event') === 'all' ? () => true : isEventWorthy;
  const eventIds = (warnState?.warnings || []).filter(eventFilter).map((w) => w.id).join(',');
  const events = useMemo(() => sortEvents((warnState?.warnings || []).filter(eventFilter)), [eventIds]); // eslint-disable-line react-hooks/exhaustive-deps
  const eventMode = events.length > 0 && new URLSearchParams(window.location.search).get('event') !== '0';
  const [eventId, setEventId] = useState(null);
  const eventIdx = Math.max(0, events.findIndex((w) => w.id === eventId));
  // ---- Warning check-in (?checkin=1 starts with it, for testing).
  const checkIds = (warnState?.warnings || []).filter((w) => CHECKIN_PHEN.has(w.type?.phen) && !isEventWorthy(w)).map((w) => w.id).join(',');
  const checkins = useMemo(
    () =>
      [...(warnState?.warnings || []).filter((w) => CHECKIN_PHEN.has(w.type?.phen) && !isEventWorthy(w))]
        .sort((a, b) => (b.danger === 'high') - (a.danger === 'high') || Date.parse(b.sent || 0) - Date.parse(a.sent || 0))
        .slice(0, CHECKIN_MAX),
    [checkIds] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [checkin, setCheckin] = useState(() => (new URLSearchParams(window.location.search).get('checkin') === '1' ? 0 : null)); // index while on, else null
  const checkWarn = !eventMode && checkin != null && checkins.length ? checkins[Math.min(checkin, checkins.length - 1)] : null;
  const current = eventMode ? events[eventIdx] : checkWarn;
  useEffect(() => {
    if (!eventMode) return undefined;
    const id = setTimeout(() => setEventId(events[(eventIdx + 1) % events.length].id), EVENT_MS);
    return () => clearTimeout(id);
  }, [eventMode, eventIdx, events]);
  // Check-in timer: each warning in turn, then on with the tour (the outlook
  // stop comes next when it's due).
  const endCheckin = () => {
    setCheckin(null);
    if ((cityIdx + 1) % OUTLOOK_EVERY === 0) {
      setOutlook(1);
      return;
    }
    setSegIdx(0);
    setCityIdx((i) => (i + 1) % TOUR.length);
  };
  useEffect(() => {
    if (checkin == null || eventMode) return undefined;
    if (!checkins.length && warnState) {
      endCheckin();
      return undefined;
    }
    const id = setTimeout(() => (checkin + 1 < checkins.length ? setCheckin(checkin + 1) : endCheckin()), CHECKIN_MS);
    return () => clearTimeout(id);
  }, [checkin, eventMode, checkins.length, !!warnState]); // eslint-disable-line react-hooks/exhaustive-deps
  // Event time zone: the warning's state (from its counties), else the nearest radar's.
  const eventTz = current ? zoneForStation({ state: (current.area || '').match(/,\s*([A-Z]{2})\b/)?.[1] || nearestStation(...boundsOf(current.geometry).center)?.state }) || undefined : undefined;
  // ---- SPC outlook stop (every OUTLOOK_EVERY cities; ?outlook=1 starts with it).
  const [outlook, setOutlook] = useState(() => (new URLSearchParams(window.location.search).get('outlook') === '1' ? 1 : 0)); // 0 = off, else the day shown
  const [outlooks, setOutlooks] = useState({}); // day -> data | null
  useEffect(() => {
    if (!outlook || outlook !== 1) return;
    for (const day of [1, 2, 3]) fetchOutlook(day, replay, TOUR).then((d) => setOutlooks((o) => ({ ...o, [day]: d })));
  }, [outlook, replay]);
  useEffect(() => {
    if (!outlook || eventMode) return undefined;
    const id = setTimeout(() => {
      if (outlook < 3 && outlooks[outlook + 1] !== null) setOutlook(outlook + 1);
      else {
        setOutlook(0);
        setSegIdx(0);
        setCityIdx((i) => (i + 1) % TOUR.length);
      }
    }, OUTLOOK_MS);
    return () => clearTimeout(id);
  }, [outlook, eventMode, outlooks]);
  useEffect(() => {
    if (outlook !== 1) return undefined;
    // The map may not exist yet when the page starts on the outlook stop: retry briefly.
    let tries = 0;
    let t = 0;
    const fly = () => {
      if (mapRef.current) mapRef.current.flyTo([US_VIEW.lat, US_VIEW.lon], US_VIEW.zoom, { duration: 4, easeLinearity: 0.2 });
      else if (tries++ < 20) t = setTimeout(fly, 250);
    };
    fly();
    return () => clearTimeout(t);
  }, [outlook]);
  const outlookData = outlook ? outlooks[outlook] : undefined;

  const replayInfo = useMemo(() => (replay ? { time: replay, warningsFrame: warnState || { loading: true, at: replay } } : null), [replay, warnState]);

  // Weather for this city and the next one (loaded ahead of time).
  useEffect(() => {
    for (const i of [cityIdx, nextIdx]) {
      cityWeather(TOUR[i])
        .then((d) => setWeather((w) => ({ ...w, [i]: d })))
        .catch(() => setWeather((w) => ({ ...w, [i]: 'error' })));
    }
  }, [cityIdx, nextIdx]);

  // Radar for the next city, loaded ahead of time (a few seconds in, so the
  // current city's own squares go first).
  useEffect(() => {
    if (!loop) return undefined;
    const id = setTimeout(() => prefetchRadar(loop.specs, TOUR[nextIdx]), 8000);
    return () => clearTimeout(id);
  }, [cityIdx, loop]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fly to the city at the start of its turn.
  useEffect(() => {
    const map = mapRef.current;
    if (map) map.flyTo([city.lat, city.lon], ZOOM, { duration: 5, easeLinearity: 0.2 });
  }, [cityIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  // Segment timer (paused during event mode and the outlook stop). Panels with
  // no data are skipped; every OUTLOOK_EVERY cities the outlook stop comes next.
  useEffect(() => {
    if (eventMode || outlook || checkin != null) return undefined;
    const id = setTimeout(() => {
      let s = segIdx + 1;
      const d = weather[cityIdx];
      const has = (sg) => (sg === 'now' ? d && d !== 'error' && d.obs : sg === 'forecast' ? d && d !== 'error' && d.days?.length : true);
      while (s < SEGMENTS.length && !has(SEGMENTS[s].id)) s++;
      if (s < SEGMENTS.length) {
        setSegIdx(s);
        return;
      }
      if ((cityIdx + 1) % CHECKIN_EVERY === 0 && checkins.length) {
        setCheckin(0); // the city advances when the check-in ends
        return;
      }
      if (Date.now() - START > RELOAD_MS) {
        try {
          sessionStorage.setItem(KEY, String(nextIdx));
        } catch {
          // ignore
        }
        window.location.reload();
        return;
      }
      if ((cityIdx + 1) % OUTLOOK_EVERY === 0) {
        setOutlook(1); // the city advances when the outlook stop ends
        return;
      }
      setSegIdx(0);
      setCityIdx(nextIdx);
    }, seg.ms);
    return () => clearTimeout(id);
  }, [segIdx, cityIdx, eventMode, outlook, checkin]); // eslint-disable-line react-hooks/exhaustive-deps

  // The map is rebuilt after a warning screen: no frame is up until it loads.
  useEffect(() => setShownTime(null), [!!current]); // eslint-disable-line react-hooks/exhaustive-deps
  const tz = current ? eventTz : data && data !== 'error' ? data.tz : undefined;
  const latest = loop ? loop.times[loop.times.length - 1] : frame.status === 'ok' ? frame.validTime : null;
  const radarTime = loop ? shownTime : latest;
  const radarOld = latest && now - latest > 20 * 60e3;
  const dim = !outlook && (seg.id === 'now' || seg.id === 'forecast');

  return (
    <div className="fixed inset-0 z-[3000] overflow-hidden bg-black" style={{ fontFamily: FONT }}>
      <style>{`
        .ws-bc-crawl { left: 100%; transform: translateY(-50%); animation-name: ws-bc-crawl; animation-timing-function: linear; animation-iteration-count: infinite; }
        @keyframes ws-bc-crawl { from { left: 100%; transform: translate(0, -50%); } to { left: 0; transform: translate(-100%, -50%); } }
        .ws-bc-in { animation: ws-bc-in 0.6s ease-out both; }
        @keyframes ws-bc-in { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: none; } }
        .ws-bc-line { animation: ws-bc-in 0.7s ease-out both; }
        .ws-bc-stage .leaflet-control-attribution { font-size: 13px; background: rgba(11,21,48,0.75); color: #94a3b8; }
        .ws-bc-stage .leaflet-control-attribution a { color: #cbd5e1; }
      `}</style>
      <div
        className="ws-bc-stage absolute left-1/2 top-1/2 text-white"
        style={{ width: W, height: H, transform: `translate(-50%, -50%) scale(${scale})`, transformOrigin: 'center' }}
      >
        {current && (
          <div className="absolute inset-x-0 top-0 z-[600]" style={{ height: H - BAR, isolation: 'isolate' }}>
            <EventView
              warning={current}
              list={eventMode ? events : checkins}
              index={eventMode ? eventIdx : Math.min(checkin, checkins.length - 1)}
              replay={replayInfo}
              width={W}
              height={H - BAR}
            />
          </div>
        )}
        <div className={`absolute inset-x-0 top-0 z-0 ${current ? 'hidden' : ''}`} style={{ height: H - BAR, isolation: 'isolate' }}>
          {!current && <RadarMap
            product={product}
            layer={outlook ? null : stillLayer}
            details={null}
            opacity={0.85}
            initialView={{ lat: city.lat, lon: city.lon, zoom: ZOOM }}
            onViewChange={noop}
            showStations={false}
            station={null}
            onSelectStation={noop}
            onTileErrors={noop}
            onBasemapError={noop}
            overlay={outlook ? outlookData?.features : undefined}
            animation={loop && !outlook ? { specs: loop.specs, index: Math.min(loopIdx, loop.specs.length - 1), onLoaded: noop, holdUntilLoaded: true, onShown: (i) => setShownTime(loop.times[i]) } : null}
            warnings
            primary={false}
            embed
            mapRef={mapRef}
          />}
          <div className="pointer-events-none absolute inset-0 z-[500] transition-colors duration-700" style={{ background: dim ? 'rgba(5,10,30,0.45)' : 'transparent' }} />
        </div>

        <div className="pointer-events-none absolute inset-0 z-[700]">
          {!current && (
          <>
          <TitlePlate
            key={outlook ? `outlook-${outlook}` : `${cityIdx}-${seg.id}`}
            label={outlook ? 'Severe Weather Outlook' : seg.label}
            city={outlook ? DAY_NAME[outlook] : `${city.name}, ${city.state}`}
            sub={seg.id === 'radar' && data?.obs?.temp != null ? `${data.obs.temp}° ${data.obs.text || ''}` : null}
          />
          {outlook ? <OutlookPanel key={outlook} data={outlookData} /> : (
          <div className="absolute right-10 top-9 text-right text-[28px] font-semibold" style={shadow}>
            {radarTime ? (
              <div className={`inline-block px-4 py-1 ${radarOld ? 'bg-amber-600/90 text-white' : 'bg-[#0c1638]/85 text-slate-200'}`}>
                {radarOld ? 'Radar delayed: ' : 'Radar '} {timeIn(radarTime, tz)}
              </div>
            ) : (
              <div className="inline-block bg-[#0c1638]/85 px-4 py-1 text-slate-300">Radar loading</div>
            )}
            <div className="mt-2 text-[26px] text-slate-200">
              Next: {TOUR[nextIdx].name}, {TOUR[nextIdx].state}
            </div>
          </div>
          )}

          {!outlook && seg.id === 'now' && data?.obs && <Conditions key={cityIdx} obs={data.obs} tz={tz} />}
          {!outlook && seg.id === 'forecast' && data?.days?.length > 0 && <Forecast key={cityIdx} days={data.days} />}
          </>
          )}
          {replay && (
            <div className="absolute bottom-[124px] right-6 bg-amber-600/90 px-4 py-1 text-[24px] font-bold uppercase text-white">
              Replay: {replay.toLocaleString('en-US', { timeZone: tz, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}
            </div>
          )}

          {/* Bottom bar: logo, warning crawl, clock */}
          <div className="absolute inset-x-0 bottom-0 flex" style={{ height: BAR, paddingTop: 4 }}>
            <div className="absolute inset-x-0 top-0 h-[4px]" style={{ background: 'linear-gradient(90deg, #1d4ed8, #06b6d4, #22c55e, #facc15, #f97316, #dc2626)' }} />
            <div className="flex w-[330px] items-center gap-3 px-4" style={{ background: '#0b1530' }}>
              <img src="/logo-192.png" alt="" className="h-[88px] w-[88px] shrink-0" />
              <div style={shadow}>
                <div className="text-[30px] font-bold uppercase leading-none">Weather</div>
                <div className="text-[30px] font-bold uppercase leading-none text-sky-300">Spectrum</div>
              </div>
            </div>
            <Crawl text={crawlText(warnState)} />
            <div className="flex w-[300px] flex-col items-end justify-center px-6" style={{ background: '#12204f', ...shadow }}>
              <div className="text-[52px] font-bold leading-none">{fmt(now, tz, { hour: 'numeric', minute: '2-digit' })}</div>
              <div className="text-[24px] font-semibold text-sky-200">
                {fmt(now, tz, { timeZoneName: 'short' }).split(' ').pop()} {fmt(now, tz, { weekday: 'short', month: 'short', day: 'numeric' })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
