// Social post for a period's tornado warnings: the map of every warning, the
// date range, the count and the busiest day / states, plus caption drafts.
// Every number comes from the warning list shown on the page.

import { STATES, periodLabel, periodPhrase, rangeText } from './history';
import { postTheme, logoSize, withAlpha } from '../brand/brand';
import { headerStyle, headerText, headerFill, headerBgLight, drawAccent } from '../radar/postHeader';

// The header icon on these posts is always the tornado one.
const TORNADO = { type: { phen: 'TO' } };

export const STYLES = [
  { id: 'spectrum', label: 'Spectrum', note: 'Navy bars, orange accent' },
  { id: 'clean', label: 'Clean', note: 'Full map, boxes on top' },
  { id: 'map', label: 'Map only', note: 'Just the map, no text' },
];

const CREDIT = 'Data: NWS warnings via Iowa Environmental Mesonet. Map: OpenFreeMap, © OpenStreetMap';

// Where the map goes. header (optional): header options (radar/postHeader);
// its height and position move the map, and a glass header lets the map run
// underneath. headY: top of the header band; overlay: header over the map.
export function mapArea(size, style, header) {
  if (style === 'map') return { x: 0, y: 0, w: size.w, h: size.h };
  if (style === 'clean') return { x: 0, y: 0, w: size.w, h: size.h - 34, foot: 34 };
  const hd = header || {};
  const head = Math.round(Math.max(110, size.h * 0.13) * (hd.height || 1));
  const foot = Math.round(Math.max(48, size.h * 0.05));
  const bottom = hd.position === 'bottom';
  if (hd.bg === 'glass') return { x: 0, y: 0, w: size.w, h: size.h - foot, head, foot, headY: bottom ? size.h - foot - head : 0, overlay: true, bottom };
  if (bottom) return { x: 0, y: 0, w: size.w, h: size.h - head - foot, head, foot, headY: size.h - foot - head, bottom };
  return { x: 0, y: head, w: size.w, h: size.h - head - foot, head, foot, headY: 0 };
}

function fitText(ctx, text, font, weight, maxSize, maxWidth, minSize = 12) {
  let s = maxSize;
  for (; s > minSize; s -= 1) {
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

const dayText = (day) => new Date(`${day}T12:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

// info: { period, now, state, count, stats } (stats from summarize())
export function defaultHeadline(info) {
  if (info.period.kind === 'week') {
    const [y, m, d] = info.period.start.split('-').map(Number);
    return `Tornado Warnings: Week of ${new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }
  return `Tornado Warnings: ${periodLabel(info.period)}`;
}
export function defaultSubline(info) {
  const { text, ongoing } = rangeText(info.period, info.now);
  return `${text}${ongoing ? ' (so far)' : ''} · ${info.state ? STATES[info.state] : 'Nationwide'}`;
}

function topStates(info, n) {
  return info.stats.byState.slice(0, n).map(([s, c]) => `${s} ${c}`).join(' · ');
}

function statRows(info) {
  const rows = [];
  if (info.stats.busiestDay) rows.push(['Busiest day', `${dayText(info.stats.busiestDay.day)} (${info.stats.busiestDay.count})`]);
  if (info.state) {
    if (info.stats.byOffice[0]) rows.push(['Most from', `NWS ${info.officeName(info.stats.byOffice[0][0])} (${info.stats.byOffice[0][1]})`]);
  } else {
    rows.push(['States', String(info.stats.byState.length)]);
    if (info.stats.byState.length) rows.push(['Most', topStates(info, 3)]);
  }
  return rows;
}
const statsHeight = (info, u) => Math.round(22 * u) * 2 + Math.round(92 * u) + Math.round(24 * u) + 10 * u + statRows(info).length * Math.round(30 * u) + Math.round(26 * u);
const chartHeight = (u) => Math.round(170 * u);
const scaleOf = (size) => Math.min(size.w, size.h * 1.15) / 1080;
const marginOf = (size) => Math.round(size.w * 0.035);
const chartSideBySide = (opts, size, u) => !opts.stats || size.w - Math.round(Math.min(470 * u, size.w * 0.48)) - marginOf(size) * 3 >= 340 * u;

// How much of the map area (post pixels) the text boxes cover at the top and
// bottom, so the map can be framed to keep every warning clear of them.
export function coveredEdges(info, size, styleId, opts, header) {
  if (styleId === 'map') return { top: 0, bottom: 0 };
  const u = scaleOf(size);
  const M = marginOf(size);
  let bottom = 0;
  const sh = opts.stats ? statsHeight(info, u) : 0;
  const ch = opts.chart && info.count > 0 ? chartHeight(u) : 0;
  if (sh || ch) bottom = M * 0.7 + (sh && ch && !chartSideBySide(opts, size, u) ? sh + 12 * u + ch : Math.max(sh, ch)) + 10 * u;
  // Clean style: the headline box sits on the map, top left.
  const top = styleId === 'clean' ? M + Math.round(58 * u) + Math.round(30 * u) + 46 + 10 * u : 0;
  // Never more than about a third of the map (a fifth on wide pictures, where
  // the boxes sit in the corners and warnings can run between them).
  const area = mapArea(size, styleId, header);
  const cap = area.h * (area.w / area.h > 1.3 ? 0.2 : 0.36);
  // A glass header sits over the map: keep warnings out from under it too.
  const underTop = area.overlay && !area.bottom ? area.head : 0;
  const underBottom = area.overlay && area.bottom ? area.head : 0;
  return { top: Math.round(top + underTop), bottom: Math.round(Math.min(bottom, cap) + underBottom) };
}

// The stats card: big count, then a few lines.
function drawStats(ctx, info, x, yBottom, w, u, font, T) {
  const pad = Math.round(22 * u);
  const big = Math.round(92 * u);
  const small = Math.round(24 * u);
  const row = Math.round(30 * u);
  const rows = statRows(info);
  const h = statsHeight(info, u);
  const y = yBottom - h;
  ctx.fillStyle = 'rgba(11,18,32,0.88)';
  roundRect(ctx, x, y, w, h, 14 * u);
  ctx.fill();
  ctx.fillStyle = T.accentFill(ctx, x, x + w);
  ctx.fillRect(x, y + 14 * u, 5 * u, h - 28 * u);

  ctx.textBaseline = 'top';
  let cy = y + pad;
  fitText(ctx, info.count.toLocaleString(), font.head, font.headWeight || 700, big, w - pad * 2);
  ctx.fillStyle = T.number;
  ctx.fillText(info.count.toLocaleString(), x + pad, cy);
  cy += big;
  fitText(ctx, info.count === 1 ? 'tornado warning issued' : 'tornado warnings issued', font.body, 600, small, w - pad * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(info.count === 1 ? 'tornado warning issued' : 'tornado warnings issued', x + pad, cy);
  cy += small + 10 * u;
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(x + pad, cy, w - pad * 2, 1.5 * u);
  cy += 8 * u;
  for (const [k, v] of rows) {
    ctx.font = `400 ${Math.round(21 * u)}px ${font.body}`;
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(k, x + pad, cy + 4 * u);
    const kw = Math.max(ctx.measureText(k).width + 14 * u, 120 * u);
    fitText(ctx, v, font.body, 600, Math.round(22 * u), w - pad * 2 - kw);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(v, x + pad + kw, cy + 3 * u);
    cy += row;
  }
  ctx.font = `400 ${Math.round(16 * u)}px ${font.body}`;
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('Warnings issued, not confirmed tornadoes.', x + pad, cy + 6 * u);
  return h;
}

// Bars by month (year) or by day (month, week).
function drawChart(ctx, info, x, yBottom, w, h, u, font) {
  const bars = info.stats.bars;
  const pad = Math.round(16 * u);
  const title = info.period.kind === 'year' ? 'By month' : 'By day';
  const y = yBottom - h;
  ctx.fillStyle = 'rgba(11,18,32,0.88)';
  roundRect(ctx, x, y, w, h, 14 * u);
  ctx.fill();
  ctx.textBaseline = 'top';
  ctx.font = `600 ${Math.round(18 * u)}px ${font.body}`;
  ctx.fillStyle = '#cbd5e1';
  ctx.fillText(title, x + pad, y + pad * 0.8);
  const labelH = Math.round(18 * u);
  const top = y + pad + Math.round(26 * u);
  const bottom = y + h - pad - labelH;
  const max = Math.max(1, ...bars.map((b) => b.count));
  const slot = (w - pad * 2) / bars.length;
  const bw = Math.max(1, slot * (bars.length > 12 ? 0.72 : 0.62));
  ctx.textAlign = 'center';
  bars.forEach((b, i) => {
    const bx = x + pad + i * slot + (slot - bw) / 2;
    const bh = (b.count / max) * (bottom - top - 18 * u);
    ctx.fillStyle = '#ef4444';
    if (b.count) ctx.fillRect(bx, bottom - Math.max(2 * u, bh), bw, Math.max(2 * u, bh));
    const showLabel = bars.length <= 12 || i === 0 || (i + 1) % 5 === 0;
    if (showLabel) {
      ctx.font = `400 ${Math.round(14 * u)}px ${font.body}`;
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(b.label, bx + bw / 2, bottom + 4 * u);
    }
    if (b.count === max && max > 0) {
      ctx.font = `600 ${Math.round(14 * u)}px ${font.body}`;
      ctx.fillStyle = '#38bdf8';
      ctx.fillText(String(b.count), bx + bw / 2, bottom - bh - 18 * u);
    }
  });
  ctx.textAlign = 'left';
}

// opts: { size, style, font, headline, subline, stats, chart, brand, logoImg, moves }
// moves: { head|stats|chart: { px, py, s } } puts a box's top-left corner at
// that fraction of the picture's width/height (so a moved box sits in about
// the same place in every size) and scales it by s. Returns where each box was
// drawn: { id: { x, y, w, h, s } }.
export function drawPost(canvas, mapImg, info, opts) {
  const { size, style, font } = opts;
  canvas.width = size.w;
  canvas.height = size.h;
  const ctx = canvas.getContext('2d');
  const hd = headerStyle(opts.header);
  const area = mapArea(size, style.id, hd);
  // The part of the map not under the header (the boxes stay in it).
  const freeTop = area.overlay && !area.bottom ? area.head : area.y;
  const freeBottom = area.overlay && area.bottom ? area.headY : area.y + area.h;
  const room = { x: 0, y: freeTop, w: size.w, h: freeBottom - freeTop };
  const u = Math.min(size.w, size.h * 1.15) / 1080;
  const M = Math.round(size.w * 0.035);
  const headWeight = font.headWeight || 700;
  const T = postTheme(opts.brand, opts.logoImg);
  const boxes = {};
  // Sizes and moves a box (w x h at normal size) by the user's settings, kept
  // inside the map area, and sets the canvas up to draw it at 0,0 at normal
  // size. anchor(w, h): its usual top-left for that drawn size. Call
  // ctx.restore() when the box is drawn. Returns its drawn height.
  const place = (id, w, h, anchor) => {
    const m = opts.moves?.[id] || {};
    const k = Math.max(0.5, Math.min(m.s || 1, 2.2, room.w / w, room.h / h));
    const sw = w * k;
    const sh = h * k;
    const [x, y] = m.px != null ? [m.px * size.w, m.py * size.h] : anchor(sw, sh);
    const nx = Math.max(room.x, Math.min(x, room.x + room.w - sw));
    const ny = Math.max(room.y, Math.min(y, room.y + room.h - sh));
    boxes[id] = { x: nx, y: ny, w: sw, h: sh, s: k };
    ctx.save();
    ctx.translate(nx, ny);
    ctx.scale(k, k);
    return sh;
  };

  ctx.fillStyle = '#0b1220';
  ctx.fillRect(0, 0, size.w, size.h);
  if (mapImg) {
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(mapImg, 0, 0, mapImg.width, mapImg.height, area.x, area.y, area.w, area.h);
  }

  if (style.id === 'map') {
    // Just the map. The small credit line stays: the map data's license requires it.
    const fs = Math.round(Math.max(12, 15 * u));
    ctx.font = `400 ${fs}px ${font.body}`;
    const credit = 'Data: NWS via IEM · Map: OpenFreeMap, © OpenStreetMap';
    const tw = ctx.measureText(credit).width;
    ctx.fillStyle = 'rgba(11,18,32,0.6)';
    roundRect(ctx, size.w - tw - 24 - 8, size.h - fs - 16 - 8, tw + 24, fs + 16, 6);
    ctx.fill();
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(credit, size.w - tw - 20, size.h - 8 - (fs + 16) / 2);
    ctx.textBaseline = 'alphabetic';
    // Branded: logo (or name) in the top-left corner.
    const logo = logoSize(T.logo, 240 * u, 110 * u);
    if (logo.w) {
      ctx.fillStyle = withAlpha(T.primary, 0.55);
      roundRect(ctx, M - 10 * u, M - 10 * u, logo.w + 20 * u, logo.h + 20 * u, 10 * u);
      ctx.fill();
      ctx.drawImage(T.logo, M, M, logo.w, logo.h);
    } else if (T.branded && T.footName) {
      const ns = fitText(ctx, T.footName, font.body, 600, Math.round(24 * u), size.w * 0.6, 12);
      const nw = ctx.measureText(T.footName).width;
      ctx.fillStyle = withAlpha(T.primary, 0.75);
      roundRect(ctx, M - 10 * u, M - 8 * u, nw + 20 * u, ns + 16 * u, 8 * u);
      ctx.fill();
      ctx.textBaseline = 'top';
      ctx.fillStyle = T.text;
      ctx.fillText(T.footName, M, M);
      ctx.textBaseline = 'alphabetic';
    }
    return boxes;
  }

  if (style.id === 'clean') {
    // Headline box, with the logo if any (sized so the box keeps its height).
    const boxH = Math.round(58 * u) + Math.round(30 * u) + 46;
    const logo = logoSize(T.logo, 240 * u * hd.logoSize, (boxH - 24) * hd.logoSize);
    const lw = logo.w ? logo.w + 18 : 0;
    const tb = headerText(ctx, hd, { head: font.head, body: font.body, headWeight, caps: false, subWeight: 600 }, opts.headline, opts.subline, size.w - M * 2 - 44 - lw, Math.round(58 * u), Math.round(30 * u), TORNADO);
    const bw = tb.w + 44 + lw;
    const bh = Math.max(tb.h + 46, logo.h + 24);
    place('head', bw, bh, () => [M, M]);
    ctx.fillStyle = hd.bg === 'auto' ? withAlpha(T.primary, 0.88) : headerFill(ctx, hd, 0, 0, bw, bh, '#FF0000');
    roundRect(ctx, 0, 0, bw, bh, 12);
    ctx.fill();
    const aw = hd.accent === 'stripes' ? Math.max(8, hd.accentWidth) : hd.accent === 'color' ? Math.max(3, hd.accentWidth * 0.8) : 5;
    drawAccent(ctx, hd, 0, 14, aw, bh - 28, T.accentSolid);
    if (logo.w) ctx.drawImage(T.logo, 20, (bh - logo.h) / 2, logo.w, logo.h);
    const light = hd.bg === 'auto' ? T.text === '#0b1220' : headerBgLight(hd, '#FF0000');
    tb.draw(24 + lw, (bh - tb.h) / 2, {
      head: hd.color || (hd.bg === 'auto' ? T.text : light ? '#0b1220' : '#ffffff'),
      sub: hd.subColor || (hd.bg === 'auto' ? T.sub : light ? '#1e293b' : 'rgba(255,255,255,0.85)'),
    });
    ctx.restore();
  } else {
    // Header band (top or bottom; over the map when it's glass).
    const HY = area.headY;
    const HH = area.head;
    if (hd.bg === 'auto') {
      const g = ctx.createLinearGradient(0, HY, 0, HY + HH);
      g.addColorStop(0, T.headTop);
      g.addColorStop(1, T.headBottom);
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = headerFill(ctx, hd, 0, HY, size.w, HH, '#FF0000');
    }
    ctx.fillRect(0, HY, size.w, HH);
    const aw = hd.accent === 'auto' ? 6 : Math.round(hd.accentWidth * (size.w / 1080));
    const accentOn = hd.accent !== 'off';
    drawAccent(ctx, hd, 0, area.bottom ? HY : HY + HH - aw, size.w, aw, T.accentFill(ctx, 0, size.w));
    const innerY = area.bottom && accentOn ? HY + aw : HY;
    const innerH = HH - (accentOn ? aw : 0);
    const logo = logoSize(T.logo, size.w * 0.26 * hd.logoSize, Math.min(innerH - 8, innerH * 0.72 * hd.logoSize));
    const logoLeft = hd.logoSide === 'left';
    if (logo.w) ctx.drawImage(T.logo, logoLeft ? M : size.w - M - logo.w, innerY + (innerH - logo.h) / 2, logo.w, logo.h);
    const textX0 = M + (logo.w && logoLeft ? logo.w + M * 0.6 : 0);
    const textW = size.w - M * 2 - (logo.w ? logo.w + M * 0.6 : 0);
    const light = hd.bg === 'auto' ? T.text === '#0b1220' : headerBgLight(hd, '#FF0000');
    const tb = headerText(ctx, hd, { head: font.head, body: font.body, headWeight, caps: false, subWeight: 600 }, opts.headline, opts.subline, textW, Math.round(HH * 0.42), Math.round(HH * 0.22), TORNADO);
    const tx = hd.align === 'center' ? textX0 + (textW - tb.w) / 2 : hd.align === 'right' ? textX0 + textW - tb.w : textX0;
    tb.draw(tx, innerY + Math.round((innerH - tb.h) / 2), {
      head: hd.color || (hd.bg === 'auto' ? T.text : light ? '#0b1220' : '#ffffff'),
      sub: hd.subColor || (hd.bg === 'auto' ? T.sub : light ? '#1e293b' : 'rgba(255,255,255,0.85)'),
    });
    // Where the header is, for tap-to-edit.
    Object.defineProperty(boxes, 'regions', { value: { header: { x: 0, y: HY, w: size.w, h: HH } } });
  }

  // Cards along the bottom of the map: stats on the left, chart on the right
  // (stacked when the picture is too narrow for both).
  const bottom = freeBottom - M * 0.7;
  const statsW = Math.round(Math.min(470 * u, size.w * 0.48));
  let statsH = 0;
  if (opts.stats) {
    const h = statsHeight(info, u);
    statsH = place('stats', statsW, h, (w2, h2) => [M, bottom - h2]);
    drawStats(ctx, info, 0, h, statsW, u, font, T);
    ctx.restore();
  }
  if (opts.chart && info.count > 0) {
    const sideBySide = chartSideBySide(opts, size, u);
    const cw = sideBySide ? (opts.stats ? Math.min(460 * u, size.w - statsW - M * 3) : Math.min(560 * u, size.w - M * 2)) : statsW;
    const ch = chartHeight(u);
    const cyB = sideBySide ? bottom : bottom - statsH - 12 * u;
    place('chart', cw, ch, (w2, h2) => [sideBySide ? size.w - M - w2 : M, cyB - h2]);
    drawChart(ctx, info, 0, ch, cw, ch, u, font);
    ctx.restore();
  }

  // Footer.
  const fy = style.id === 'clean' ? area.y + area.h : size.h - area.foot;
  const fh = size.h - fy;
  ctx.fillStyle = style.id === 'clean' ? withAlpha(T.primary, 0.92) : T.foot;
  ctx.fillRect(0, fy, size.w, fh);
  ctx.textBaseline = 'middle';
  let left = 0;
  if (T.footName) {
    fitText(ctx, T.footName, font.body, 600, Math.round(Math.max(15, fh * 0.4)), size.w * 0.45, 11);
    ctx.fillStyle = T.footText;
    ctx.fillText(T.footName, M, fy + fh / 2);
    left = ctx.measureText(T.footName).width + M;
  }
  fitText(ctx, CREDIT, font.body, 400, Math.round(Math.max(12, fh * 0.28)), size.w - M * 2 - left, 9);
  ctx.fillStyle = T.footMuted;
  ctx.textAlign = 'right';
  ctx.fillText(CREDIT, size.w - M, fy + fh / 2);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  return boxes;
}

// ---- captions
export function buildCaptions(info, { link }) {
  const n = info.count.toLocaleString();
  const what = info.count === 1 ? 'tornado warning' : 'tornado warnings';
  const when = periodPhrase(info.period, info.now);
  const where = info.state ? `in ${STATES[info.state]}` : 'across the U.S.';
  const busy = info.stats.busiestDay;
  const busyLine = busy && info.count > 1 ? `The busiest day was ${dayText(busy.day)}, with ${busy.count}.` : '';
  const top = !info.state && info.stats.byState.length > 1
    ? `Most warnings: ${info.stats.byState.slice(0, 3).map(([s, c]) => `${STATES[s]} (${c})`).join(', ')}.`
    : '';
  const url = link ? `\n\nSee any year, month or week: ${link}` : '';
  const note = 'These are National Weather Service warnings, not confirmed tornadoes.';
  const end = (t) => (t.endsWith('.') ? t : `${t}.`);
  const { ongoing } = rangeText(info.period, info.now);
  const lead = info.period.kind === 'week' ? `The week of ${periodLabel(info.period)}` : `${periodLabel(info.period)}${ongoing ? ' so far' : ''}`;
  return [
    {
      id: 'numbers',
      label: 'By the numbers',
      text: [end(`${n} ${what} were issued ${where} ${when}`), busyLine, top, note].filter(Boolean).join(' ') + url,
    },
    {
      id: 'short',
      label: 'Short',
      text: `${lead}: ${end(`${n} ${what} ${where}`)}${url}`,
    },
    {
      id: 'question',
      label: 'Question',
      text: [
        `How busy was ${info.period.kind === 'week' ? 'the week of ' : ''}${periodLabel(info.period)}${rangeText(info.period, info.now).ongoing ? ' so far' : ''}${info.state ? ` in ${STATES[info.state]}` : ''}?`,
        end(`The National Weather Service issued ${n} ${what}${info.state ? '' : ` ${where}`}`),
        busyLine,
        top,
      ].filter(Boolean).join(' ') + url,
    },
  ];
}
