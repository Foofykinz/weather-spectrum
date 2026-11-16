// Social post maker: a radar image sized for Facebook plus caption drafts.
// Every fact in a caption (warning type, area, end time, hail/wind tags, scan
// time, radar) comes from the NWS alert or the scan itself. Nothing about the
// storms is described beyond what those say.

import { warningsAt, watchesAtPoint } from './providers/warnings';
import { LEGENDS, radarMode } from './legends';

export const SIZES = [
  { id: 'square', label: 'Square', note: '1080 x 1080', w: 1080, h: 1080 },
  { id: 'landscape', label: 'Wide', note: '1200 x 630', w: 1200, h: 630 },
  { id: 'portrait', label: 'Tall', note: '1080 x 1350', w: 1080, h: 1350 },
];

export const STYLES = [
  { id: 'spectrum', label: 'Spectrum', note: 'Navy bars, orange accent' },
  { id: 'alert', label: 'Alert', note: 'Banner in the warning color' },
  { id: 'clean', label: 'Clean', note: 'Full map, small text' },
];

const SYSTEM = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
// Fonts from Google Fonts, loaded only when picked.
export const FONTS = [
  { id: 'system', label: 'Standard', head: SYSTEM, body: SYSTEM },
  { id: 'oswald', label: 'Oswald', head: '"Oswald"', body: '"Oswald"', css: 'Oswald:wght@400;600;700' },
  { id: 'bebas', label: 'Bebas Neue', head: '"Bebas Neue"', body: SYSTEM, css: 'Bebas+Neue', headWeight: 400 },
  { id: 'inter', label: 'Inter', head: '"Inter"', body: '"Inter"', css: 'Inter:wght@400;600;800', headWeight: 800 },
  { id: 'slab', label: 'Roboto Slab', head: '"Roboto Slab"', body: '"Roboto Slab"', css: 'Roboto+Slab:wght@400;600;700' },
];

export async function loadFont(font) {
  if (!font.css) return true;
  const id = `ws-font-${font.id}`;
  if (!document.getElementById(id)) {
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${font.css}&display=swap`;
    const loaded = new Promise((res, rej) => {
      link.onload = res;
      link.onerror = rej;
    });
    document.head.appendChild(link);
    await loaded;
  }
  const w = font.headWeight || 700;
  await Promise.all([document.fonts.load(`${w} 40px ${font.head}`), document.fonts.load(`400 20px ${font.body}`), document.fonts.load(`600 20px ${font.body}`)]);
  return document.fonts.check(`${w} 40px ${font.head}`);
}

// ---------- what's in the picture

export function cropFor(snap, size, styleId) {
  const { width: W, height: H } = snap.canvas;
  const area = mapArea(size, styleId);
  const aspect = area.w / area.h;
  let cw = W;
  let ch = W / aspect;
  if (ch > H) {
    ch = H;
    cw = H * aspect;
  }
  return { x: (W - cw) / 2, y: (H - ch) / 2, w: cw, h: ch };
}

function rank(w) {
  return (w.danger === 'emergency' ? -20 : w.danger === 'high' ? -10 : 0) + (w.type?.rank ?? 99);
}

function pointsOf(coords, out = []) {
  if (typeof coords[0] === 'number') out.push(coords);
  else for (const c of coords) pointsOf(c, out);
  return out;
}

// Warnings / watches that are inside the cropped picture: a vertex inside it,
// or a sample point of the picture inside the shape.
export function alertsInView(state, snap, crop) {
  const nw = snap.toLatLng(crop.x, crop.y);
  const se = snap.toLatLng(crop.x + crop.w, crop.y + crop.h);
  const inBox = (lat, lon) => lat <= nw.lat && lat >= se.lat && lon >= nw.lng && lon <= se.lng;
  const samples = [];
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) samples.push(snap.toLatLng(crop.x + (crop.w * i) / 4, crop.y + (crop.h * j) / 4));
  const warnings = (state?.warnings || []).filter(
    (w) => pointsOf(w.geometry.coordinates).some(([lon, lat]) => inBox(lat, lon)) || samples.some((p) => warningsAt([w], p.lat, p.lng).length)
  );
  const shapes = state?.shapes;
  const watches = shapes
    ? (state.watches || []).filter(
        (w) =>
          w.ugcs.some((u) => shapes.has(u) && pointsOf(shapes.get(u)).some(([lat, lon]) => inBox(lat, lon))) ||
          samples.some((p) => watchesAtPoint([w], shapes, p.lat, p.lng).length)
      )
    : [];
  return { warnings: warnings.sort((a, b) => rank(a) - rank(b)), watches };
}

// Past warnings: the polygon archive has no county names, so look them up in
// IEM's record of the event (the counties under the warning at time t).
const areaCache = new Map();
export function pastArea(w, t) {
  const e = w.event;
  if (!e) return Promise.resolve(null);
  const url = `https://mesonet.agron.iastate.edu/json/vtec_event.py?wfo=${e.wfo}&year=${e.year}&phenomena=${e.phen}&significance=${e.sig}&etn=${e.etn}`;
  if (!areaCache.has(url)) {
    areaCache.set(
      url,
      fetch(url)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => {
          areaCache.delete(url);
          return null;
        })
    );
  }
  return areaCache.get(url).then((j) => {
    const ugcs = (j?.ugcs || []).filter((u) => Date.parse(u.utc_issue) <= t && Date.parse(u.utc_expire) > t);
    const list = (ugcs.length ? ugcs : j?.ugcs || []).filter((u) => u.name).map((u) => `${u.name}, ${u.ugc.slice(0, 2)}`);
    return list.length ? [...new Set(list)].join('; ') : null;
  });
}

// ---------- text helpers

// Time zone for all post text (undefined = the viewer's own).
export const TIME_ZONES = [
  { id: '', label: 'My time' },
  { id: 'America/New_York', label: 'Eastern' },
  { id: 'America/Chicago', label: 'Central' },
  { id: 'America/Denver', label: 'Mountain' },
  { id: 'America/Phoenix', label: 'Arizona' },
  { id: 'America/Los_Angeles', label: 'Pacific' },
  { id: 'America/Anchorage', label: 'Alaska' },
  { id: 'Pacific/Honolulu', label: 'Hawaii' },
  { id: 'America/Puerto_Rico', label: 'Atlantic' },
];
let tz;
const setTz = (z) => {
  tz = z || undefined;
};
const time = (d) => new Date(d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZoneName: 'short', timeZone: tz });
const dateLong = (d) => new Date(d).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: tz });
const dateShort = (d) => new Date(d).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric', timeZone: tz });

// Best guess of a radar's time zone from its state (split states use the
// zone most of the state is in). Users can change it.
const STATE_TZ = {
  Eastern: 'CT DE DC FL GA IN KY ME MD MA MI NH NJ NY NC OH PA RI SC VT VA WV',
  Central: 'AL AR IL IA KS LA MN MS MO NE ND OK SD TN TX WI',
  Mountain: 'CO ID MT NM UT WY',
  Arizona: 'AZ',
  Pacific: 'CA NV OR WA',
  Alaska: 'AK',
  Hawaii: 'HI',
  Atlantic: 'PR',
};
export function zoneForStation(station) {
  const st = station?.state;
  const label = Object.keys(STATE_TZ).find((k) => STATE_TZ[k].split(' ').includes(st));
  return label ? TIME_ZONES.find((z) => z.label === label).id : '';
}

// "Osage, OK; Washington, OK" -> "Osage and Washington, OK"
export function bannerText(w) {
  if (!w?.area) return '';
  const byState = new Map();
  for (const part of w.area.split(';').map((s) => s.trim()).filter(Boolean)) {
    const m = part.match(/^(.*),\s*([A-Z]{2})$/);
    const [name, st] = m ? [m[1], m[2]] : [part, ''];
    if (!byState.has(st)) byState.set(st, []);
    byState.get(st).push(name);
  }
  const list = (a) => (a.length <= 2 ? a.join(' and ') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
  return [...byState].map(([st, names]) => `${list(names)}${st ? `, ${st}` : ''}`).join('; ');
}
export const bannerTime = (w, zone) => {
  setTz(zone);
  return w?.ends ? `until ${time(w.ends)}` : '';
};
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function warningName(w) {
  if (w.danger === 'emergency') return w.type.phen === 'FF' ? 'Flash Flood Emergency' : w.type.phen === 'TO' ? 'Tornado Emergency' : w.type.event;
  if (w.danger === 'high' && w.type.phen === 'TO') return 'PDS Tornado Warning';
  return w.type.event;
}

function shortArea(area, max = 140) {
  if (!area) return null;
  return area.length > max ? `${area.slice(0, area.lastIndexOf(';', max) > 0 ? area.lastIndexOf(';', max) : max)} and nearby areas` : area;
}

function tagLine(w) {
  const t = [];
  if (w.tornado === 'OBSERVED') t.push('Tornado observed.');
  else if (w.tornado === 'RADAR INDICATED') t.push('Radar indicated rotation.');
  else if (w.tornado === 'POSSIBLE') t.push('Tornado possible.');
  if (w.hail) t.push(`Hail up to ${w.hail}.`);
  if (w.wind) t.push(`Wind gusts to ${w.wind}.`);
  if (w.danger === 'high' && w.type.phen !== 'TO') t.push('Damage threat: considerable or destructive.');
  return t.join(' ');
}

const ACTION = {
  TO: 'If you are in the warning, go to your safe place now: an interior room on the lowest floor, away from windows.',
  EW: 'If you are in the warning, take shelter now as if for a tornado.',
  SV: 'If you are in the warning, move indoors and stay away from windows.',
  FF: 'Turn around, don’t drown: never drive into flooded roads.',
  FA: 'Avoid flooded areas and never drive into flooded roads.',
  SQ: 'Travel will be dangerous. Delay travel if you can.',
};

function countList(items, name) {
  const counts = new Map();
  for (const it of items) counts.set(name(it), (counts.get(name(it)) || 0) + 1);
  return [...counts].map(([k, n]) => plural(n, k)).join(', ');
}

function radarLine(info) {
  const where = info.station ? `${info.station.icao} (${info.station.name}, ${info.station.state})` : 'the national radar mosaic';
  return `${info.product.name} from ${where}`;
}

export function hashtag(info) {
  const st = info.station?.state;
  return st && /^[A-Z]{2}$/.test(st) ? `#${st.toLowerCase()}wx` : '';
}

// Caption drafts. info: { product, station, time, past, warnings, watches }
export function buildCaptions(info, { link, tags }) {
  setTz(info.tz);
  const t = info.time;
  const ws = info.warnings;
  const top = ws[0];
  const was = info.past;
  const radar = `${radarLine(info)} at ${time(t)}${was ? ` on ${dateShort(t)}` : ''}.`;
  const tail = [
    link ? `Live radar: theweatherspectrum.com/radar` : '',
    'Official warnings: weather.gov',
    tags ? hashtag(info) : '',
  ].filter(Boolean);
  const join = (parts) => [...parts.filter(Boolean), tail.join('\n')].join('\n\n');
  const inEffect = () => {
    const parts = [];
    if (ws.length) parts.push(countList(ws, warningName));
    if (info.watches.length) parts.push(countList(info.watches, (w) => w.type.event));
    return parts.join(', and ');
  };

  const alert = top
    ? join([
        `${warningName(top).toUpperCase()}${top.area ? ` for ${shortArea(top.area)}` : ''}${
          top.ends ? (was ? `, in effect until ${time(top.ends)}` : ` until ${time(top.ends)}`) : ''
        }.`,
        tagLine(top),
        was ? '' : ACTION[top.type.phen] || 'Follow the instructions from the National Weather Service.',
        ws.length > 1 ? `Also ${was ? 'in effect then' : 'in effect'}: ${countList(ws.slice(1), warningName)}.` : '',
        radar,
      ])
    : null;

  const update = join([
    was ? `Looking back at ${dateLong(t)}.` : `Radar update, ${time(t)}.`,
    inEffect() ? `${was ? 'In effect in this area at that time' : 'In effect in this area right now'}: ${inEffect()}.` : was ? '' : 'No warnings in effect in this area right now.',
    radar,
    was ? '' : 'Have more than one way to get warnings, and know where you would shelter.',
  ]);

  const short = join([
    top && was
      ? `${warningName(top)}${top.area ? ` for ${shortArea(top.area, 80)}` : ''}, ${time(t)} on ${dateShort(t)}.`
      : top
      ? `${warningName(top)}${top.area ? ` for ${shortArea(top.area, 80)}` : ''}${top.ends ? ` until ${time(top.ends)}` : ''}.`
      : `${was ? 'Radar' : 'Latest radar'}, ${time(t)}${was ? ` ${dateShort(t)}` : ''}.`,
  ]);

  const recap = join([
    `Looking back: ${radarLine(info)} at ${time(t)} on ${dateLong(t)}.`,
    inEffect() ? `At that time: ${inEffect()}.` : '',
    top && top.area ? `${warningName(top)} for ${shortArea(top.area)}.` : '',
    top ? tagLine(top) : '',
  ]);

  const list = [];
  if (alert) list.push({ id: 'alert', label: 'Warning', text: alert });
  list.push({ id: 'update', label: 'Update', text: update });
  list.push({ id: 'short', label: 'Short', text: short });
  list.push({ id: 'recap', label: 'Recap', text: recap });
  if (was) list.sort((a, b) => (b.id === 'recap') - (a.id === 'recap'));
  return list;
}

export function defaultHeadline(info) {
  const top = info.warnings[0];
  if (top) return warningName(top);
  return info.past ? 'Radar look back' : 'Radar update';
}

export function defaultSubline(info) {
  setTz(info.tz);
  const where = info.station ? `${info.station.icao} ${info.product.short.replace(/^Site /, '')}` : info.product.short;
  return `${where}  |  ${info.past ? `${dateShort(info.time)}, ` : ''}${time(info.time)}`;
}

// ---------- drawing

function mapArea(size, style) {
  if (style === 'clean') return { x: 0, y: 0, w: size.w, h: size.h };
  const head = Math.round(Math.max(96, size.h * 0.12));
  const foot = Math.round(Math.max(48, size.h * 0.05));
  return { x: 0, y: head, w: size.w, h: size.h - head - foot, head, foot };
}

const luminance = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

function fitText(ctx, text, font, weight, maxSize, maxWidth, minSize = 14) {
  let s = maxSize;
  for (; s > minSize; s -= 2) {
    ctx.font = `${weight} ${s}px ${font}`;
    if (ctx.measureText(text).width <= maxWidth) break;
  }
  ctx.font = `${weight} ${s}px ${font}`;
  return s;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function legendBands(legend, frame) {
  // -> { bands: [[from, to, color]] in 0..1, ticks: [[pos, label]] }
  if (legend.type === 'gradient') {
    const min = legend.stops[0][0];
    const span = legend.max - min;
    return {
      bands: legend.stops.map(([v, c], i) => [(v - min) / span, ((i + 1 < legend.stops.length ? legend.stops[i + 1][0] : legend.max) - min) / span, c]),
      ticks: legend.ticks.map((t) => [(t - (legend.min ?? min)) / (legend.max - (legend.min ?? min)), String(t)]),
    };
  }
  if (legend.type === 'ramps') {
    const p = (v) => (v - legend.min) / (legend.max - legend.min);
    return { ramps: legend.ramps.map(([a, b, c1, c2]) => [p(a), p(b), c1, c2]), ticks: legend.ticks.map((t) => [p(t), String(t)]) };
  }
  if (legend.type === 'categories') {
    const n = legend.items.length;
    return { bands: legend.items.map((it, i) => [i / n, (i + 1) / n, it.color]), ticks: legend.items.map((it, i) => [(i + 0.5) / n, it.code]) };
  }
  if (legend.type === 'levels') {
    const mode = legend.modes[radarMode(frame?.details?.vcp)] || null;
    const colors = (mode || legend.modes.precip).colors;
    const n = colors.length;
    return {
      bands: colors.map((c, i) => [i / n, (i + 1) / n, c]),
      ticks: mode ? mode.levels.map((l, i) => [(i + 0.5) / n, l > 0 ? `+${l}` : String(l)]) : [],
    };
  }
  return null;
}

function drawLegend(ctx, info, x, y, w, font, legendImg) {
  const legend = LEGENDS[info.product.legend];
  if (!legend) return;
  const pad = 14;
  const barH = 18;
  const h = pad + 22 + barH + 22 + pad - 6;
  ctx.fillStyle = 'rgba(11,18,32,0.86)';
  roundRect(ctx, x, y - h, w, h, 10);
  ctx.fill();
  ctx.fillStyle = '#e2e8f0';
  ctx.font = `600 17px ${font}`;
  ctx.textBaseline = 'top';
  ctx.fillText(info.product.short.replace(/^Site /, ''), x + pad, y - h + pad - 2);
  if (legend.units) {
    ctx.textAlign = 'right';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(legend.units, x + w - pad, y - h + pad - 2);
    ctx.textAlign = 'left';
  }
  const bx = x + pad;
  const by = y - h + pad + 24;
  const bw = w - pad * 2;
  if (legend.type === 'image') {
    if (legendImg) ctx.drawImage(legendImg, bx, by, bw, (bw * legendImg.naturalHeight) / legendImg.naturalWidth);
    return;
  }
  const b = legendBands(legend, info.frame);
  if (!b) return;
  if (b.ramps) {
    for (const [a, z, c1, c2] of b.ramps) {
      const g = ctx.createLinearGradient(bx + a * bw, 0, bx + z * bw, 0);
      g.addColorStop(0, c1);
      g.addColorStop(1, c2);
      ctx.fillStyle = g;
      ctx.fillRect(bx + a * bw, by, (z - a) * bw + 0.5, barH);
    }
  } else {
    for (const [a, z, c] of b.bands) {
      ctx.fillStyle = c;
      ctx.fillRect(bx + a * bw, by, (z - a) * bw + 0.5, barH);
    }
  }
  ctx.fillStyle = '#cbd5e1';
  ctx.font = `400 14px ${font}`;
  ctx.textAlign = 'center';
  for (const [p, label] of b.ticks) if (p >= 0 && p <= 1) ctx.fillText(label, bx + p * bw, by + barH + 4);
  ctx.textAlign = 'left';
}

function drawWarningList(ctx, warnings, x, y, w, font, past) {
  if (!warnings.length) return;
  const rows = warnings.slice(0, 4);
  const more = warnings.length - rows.length;
  const rowH = 34;
  const pad = 12;
  const h = pad * 2 + rows.length * rowH + (more > 0 ? 24 : 0) - 6;
  ctx.fillStyle = 'rgba(11,18,32,0.86)';
  roundRect(ctx, x, y, w, h, 10);
  ctx.fill();
  ctx.textBaseline = 'middle';
  rows.forEach((wn, i) => {
    const cy = y + pad + i * rowH + 12;
    ctx.fillStyle = wn.type.color;
    roundRect(ctx, x + pad, cy - 9, 18, 18, 4);
    ctx.fill();
    ctx.fillStyle = '#f1f5f9';
    const until = wn.ends && !past ? `until ${time(wn.ends)}` : '';
    ctx.font = `400 15px ${font}`;
    const uw = until ? ctx.measureText(until).width + 10 : 0;
    fitText(ctx, warningName(wn), font, 600, 19, w - pad * 2 - 28 - uw, 12);
    ctx.fillText(warningName(wn), x + pad + 28, cy);
    if (until) {
      ctx.font = `400 15px ${font}`;
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'right';
      ctx.fillText(until, x + w - pad, cy);
      ctx.textAlign = 'left';
    }
  });
  if (more > 0) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = `400 15px ${font}`;
    ctx.fillText(`+ ${plural(more, 'more warning')}`, x + pad, y + pad + rows.length * rowH + 4);
  }
  ctx.textBaseline = 'alphabetic';
}

// Strip across the bottom of the map: the warned counties and the end time.
function drawBanner(ctx, text, right, color, y, w, h, font, M) {
  ctx.fillStyle = 'rgba(11,18,32,0.92)';
  ctx.fillRect(0, y, w, h);
  ctx.fillStyle = color || '#f59e0b';
  ctx.fillRect(0, y, Math.round(h * 0.18), h);
  ctx.textBaseline = 'middle';
  let rw = 0;
  if (right) {
    ctx.font = `600 ${Math.round(h * 0.38)}px ${font}`;
    rw = ctx.measureText(right).width + M;
    ctx.fillStyle = '#fcd34d';
    ctx.textAlign = 'right';
    ctx.fillText(right, w - M, y + h / 2);
    ctx.textAlign = 'left';
  }
  const maxW = w - M * 2 - rw;
  const s = fitText(ctx, text, font, 600, Math.round(h * 0.46), maxW, 12);
  let shown = text;
  ctx.font = `600 ${s}px ${font}`;
  while (shown.length > 4 && ctx.measureText(shown).width > maxW) shown = `${shown.slice(0, shown.length - 6).trimEnd()}...`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(shown, M, y + h / 2 + 1);
  ctx.textBaseline = 'alphabetic';
}

const CREDIT ='Unofficial graphic. Data: NOAA/NWS. Map: OpenFreeMap, © OpenStreetMap';

// opts: { size, style, font, headline, subline, legend, list }
export function drawPost(canvas, snap, crop, info, opts, legendImg) {
  const { size, style, font } = opts;
  setTz(info.tz);
  canvas.width = size.w;
  canvas.height = size.h;
  const ctx = canvas.getContext('2d');
  const area = mapArea(size, style.id);
  const headWeight = font.headWeight || 700;
  const top = info.warnings[0];

  ctx.fillStyle = '#0b1220';
  ctx.fillRect(0, 0, size.w, size.h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(snap.canvas, crop.x, crop.y, crop.w, crop.h, area.x, area.y, area.w, area.h);

  const M = Math.round(size.w * 0.035);
  const bannerH = opts.banner ? Math.round(Math.max(46, size.h * 0.055)) : 0;

  if (style.id === 'clean') {
    // Headline in a box at top-left, credits along the bottom.
    const hs = fitText(ctx, opts.headline, font.head, headWeight, 54, size.w - M * 4, 22);
    const ss = 22;
    ctx.font = `400 ${ss}px ${font.body}`;
    const sw = ctx.measureText(opts.subline).width;
    ctx.font = `${headWeight} ${hs}px ${font.head}`;
    const hw = ctx.measureText(opts.headline).width;
    const bw = Math.max(hw, sw) + 40;
    const bh = hs + ss + 44;
    ctx.fillStyle = 'rgba(11,18,32,0.86)';
    roundRect(ctx, M, M, bw, bh, 12);
    ctx.fill();
    ctx.fillStyle = top ? top.type.color : '#f59e0b';
    ctx.fillRect(M, M + 14, 5, bh - 28);
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(opts.headline, M + 22, M + 16);
    ctx.font = `400 ${ss}px ${font.body}`;
    ctx.fillStyle = '#fcd34d';
    ctx.fillText(opts.subline, M + 22, M + 22 + hs);
    if (opts.list) drawWarningList(ctx, info.warnings, size.w - M - 380, M + bh + 14 > size.h * 0.4 ? M : M + bh + 14, 380, font.body, info.past);
    if (opts.legend) drawLegend(ctx, info, M, size.h - M - 36 - bannerH, Math.min(440, size.w * 0.5), font.body, legendImg);
    if (bannerH) drawBanner(ctx, opts.banner, opts.bannerRight, top?.type.color, size.h - 34 - bannerH, size.w, bannerH, font.body, M);
    ctx.fillStyle = 'rgba(11,18,32,0.75)';
    ctx.fillRect(0, size.h - 34, size.w, 34);
    ctx.textBaseline = 'middle';
    ctx.font = `600 17px ${font.body}`;
    ctx.fillStyle = '#fbbf24';
    ctx.fillText('theweatherspectrum.com', M, size.h - 17);
    ctx.font = `400 14px ${font.body}`;
    ctx.fillStyle = '#cbd5e1';
    ctx.textAlign = 'right';
    ctx.fillText(CREDIT, size.w - M, size.h - 17);
    ctx.textAlign = 'left';
    return;
  }

  // Header band.
  const alertBand = style.id === 'alert' && top;
  if (alertBand) {
    ctx.fillStyle = top.type.color;
    ctx.fillRect(0, 0, size.w, area.head);
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, area.head);
    g.addColorStop(0, '#111a2e');
    g.addColorStop(1, '#0b1220');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size.w, area.head);
  }
  const dark = alertBand && luminance(top.type.color) > 0.35;
  const accent = ctx.createLinearGradient(0, 0, size.w, 0);
  accent.addColorStop(0, '#f97316');
  accent.addColorStop(1, '#facc15');
  ctx.fillStyle = alertBand ? 'rgba(0,0,0,0.35)' : accent;
  ctx.fillRect(0, area.head - 6, size.w, 6);

  const hs = fitText(ctx, opts.headline, font.head, headWeight, Math.round(area.head * 0.46), size.w - M * 2, 22);
  const ss = Math.round(Math.max(18, area.head * 0.2));
  const gap = 6;
  const block = hs + gap + ss;
  const y0 = Math.round((area.head - 6 - block) / 2);
  ctx.textBaseline = 'top';
  ctx.fillStyle = dark ? '#0b1220' : '#ffffff';
  ctx.fillText(alertBand ? opts.headline.toUpperCase() : opts.headline, M, y0);
  ctx.font = `400 ${ss}px ${font.body}`;
  ctx.fillStyle = alertBand ? (dark ? '#1e293b' : 'rgba(255,255,255,0.88)') : '#fcd34d';
  ctx.fillText(opts.subline, M, y0 + hs + gap);

  // Map overlays.
  if (opts.list) drawWarningList(ctx, info.warnings, size.w - M - 380, area.y + M * 0.6, 380, font.body, info.past);
  if (opts.legend) drawLegend(ctx, info, M, area.y + area.h - M * 0.6 - bannerH, Math.min(440, size.w * 0.5), font.body, legendImg);
  if (bannerH) drawBanner(ctx, opts.banner, opts.bannerRight, top?.type.color, area.y + area.h - bannerH, size.w, bannerH, font.body, M);

  // Footer band.
  const fy = area.y + area.h;
  ctx.fillStyle = '#0b1220';
  ctx.fillRect(0, fy, size.w, area.foot);
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${Math.round(area.foot * 0.4)}px ${font.body}`;
  ctx.fillStyle = '#fbbf24';
  ctx.fillText('theweatherspectrum.com', M, fy + area.foot / 2);
  const left = ctx.measureText('theweatherspectrum.com').width;
  fitText(ctx, CREDIT, font.body, 400, Math.round(area.foot * 0.3), size.w - M * 3 - left, 10);
  ctx.fillStyle = '#94a3b8';
  ctx.textAlign = 'right';
  ctx.fillText(CREDIT, size.w - M, fy + area.foot / 2);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}
