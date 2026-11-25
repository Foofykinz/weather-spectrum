import { maplibregl, climStyle, setAreas, cameraFor } from './mapStyle';
import { mapArea as bandArea } from '../warnings/post';
import { postTheme, logoSize, withAlpha } from '../brand/brand';
import { headerStyle, headerText, headerFill, headerBgLight, drawAccent, isLight } from '../radar/postHeader';

// Post images for /tornado-season, with the same options as the other post
// makers (sizes, styles, fonts, header, branding, labels and arrows):
//   - "Risk area" (default): the tilted globe map full size, with title tabs
//     ("Average Tornado Risk Area | December") and the Typical / Greater labels;
//   - "Spectrum": header band above the map, as on radar and warning posts;
//   - "Clean": full map with a headline box on top;
//   - "Map only".
// The map is drawn off screen at the post's size (renderClimMap) and kept until
// the next one, so labels and arrows can be pinned to places on it.

export const STYLES = [
  { id: 'risk', label: 'Risk area', note: 'Title tabs over the full map' },
  { id: 'spectrum', label: 'Spectrum', note: 'Header band above the map' },
  { id: 'clean', label: 'Clean', note: 'Full map, headline box on top' },
  { id: 'map', label: 'Map only', note: 'Just the map' },
];
const R = 2; // the map is drawn at half size, twice as sharp, so its names are readable
const ICON = { tornado: { type: { phen: 'TO' } }, hail: { type: { phen: 'SV' } }, wind: { type: { phen: 'HW' } } };
const credit = (info) => `Data: NOAA/NWS Storm Prediction Center reports, ${info.years[0]}-${info.years[1]} · Map: OpenFreeMap, © OpenStreetMap`;

const unitOf = (size) => Math.min(size.w, size.h * 1.15) / 1080;
const footOf = (size) => Math.round(Math.max(48, size.h * 0.05));

// Where the map goes in the picture.
export function mapArea(size, styleId, header) {
  if (styleId === 'risk') return { x: 0, y: 0, w: size.w, h: size.h - footOf(size), foot: footOf(size) };
  return bandArea(size, styleId, header);
}

// Room to keep clear inside the map (title tabs, key box) when framing the areas.
export function framePadding(size, styleId, opts) {
  const u = unitOf(size);
  if (styleId === 'risk') return { top: Math.round(130 * u), bottom: Math.round((opts.key ? 110 : 20) * u) };
  if (styleId === 'clean') return { top: Math.round(190 * u), bottom: Math.round((opts.key ? 110 : 20) * u) };
  return { top: Math.round(20 * u), bottom: Math.round((opts.key ? 110 : 20) * u) };
}

const waitFor = (map, event, ms) =>
  new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    map.once(event, () => {
      clearTimeout(t);
      resolve();
    });
  });

// Draws the month's map off screen at area.w x area.h (picture pixels), framed
// on its areas inside `pad`. Returns { snap, remove }: snap has the picture
// (canvas) and toPoint / toLatLng for that picture; call remove() when done.
export async function renderClimMap(area, month, colors, pad) {
  const box = document.createElement('div');
  Object.assign(box.style, { position: 'fixed', left: '-10000px', top: '0', width: `${area.w / R}px`, height: `${area.h / R}px`, pointerEvents: 'none' });
  document.body.appendChild(box);
  const map = new maplibregl.Map({
    container: box,
    style: await climStyle(),
    pixelRatio: R,
    interactive: false,
    attributionControl: false,
    fadeDuration: 0,
    canvasContextAttributes: { preserveDrawingBuffer: true },
    center: [-92, 35],
    zoom: 3,
  });
  const remove = () => {
    map.remove();
    box.remove();
  };
  try {
    await waitFor(map, 'load', 20000);
    setAreas(map, month, colors);
    // Tall pictures: tilt less (and zoom in a touch) so the land fills the
    // frame instead of showing space above the horizon.
    const tall = area.h / area.w > 1.1;
    const cam = cameraFor(map, month, { top: pad.top / R + 8, bottom: pad.bottom / R + 8, left: 16, right: 16 }, tall ? -0.15 : 0.2, tall ? 18 : undefined);
    if (cam) map.jumpTo(cam);
    await waitFor(map, 'idle', 20000);
    const canvas = document.createElement('canvas');
    canvas.width = area.w;
    canvas.height = area.h;
    canvas.getContext('2d').drawImage(map.getCanvas(), 0, 0, area.w, area.h);
    const snap = {
      canvas,
      toPoint(lat, lng) {
        const p = map.project([lng, lat]);
        return { x: p.x * R, y: p.y * R };
      },
      toLatLng(x, y) {
        const ll = map.unproject([x / R, y / R]);
        return { lat: ll.lat, lng: ll.lng };
      },
    };
    return { snap, remove };
  } catch (err) {
    remove();
    throw err;
  }
}

function fitText(ctx, text, font, weight, maxSize, maxWidth, minSize = 10) {
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

export const defaultHeadline = (info) => info.hazard.title;
export const defaultSubline = (info) => info.monthName;

// info: { hazardId, hazard: { title, noun, colors }, monthName, month (shapes), sel, years }
// pic: { snap } from renderClimMap. opts: { size, style, font, headline,
// subline, brand, logoImg, header, moves, areaLabels, key, tabColor, monthColor }.
// Returns where each movable box was drawn ({ id: { x, y, w, h, s } }).
export function drawPost(canvas, pic, info, opts) {
  const { size, style, font } = opts;
  canvas.width = size.w;
  canvas.height = size.h;
  const ctx = canvas.getContext('2d');
  const hd = headerStyle(opts.header);
  const area = mapArea(size, style.id, hd);
  const u = unitOf(size);
  const M = Math.round(size.w * 0.035);
  const headWeight = font.headWeight || 700;
  const T = postTheme(opts.brand, opts.logoImg);
  const colors = info.hazard.colors;
  const boxes = {};
  const freeTop = area.overlay && !area.bottom ? area.head : area.y;
  const freeBottom = area.overlay && area.bottom ? area.headY : area.y + area.h;
  const room = { x: 0, y: freeTop, w: size.w, h: freeBottom - freeTop };
  // A movable box: sized and moved by the user's settings, kept on the map.
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
  };

  ctx.fillStyle = '#0b1220';
  ctx.fillRect(0, 0, size.w, size.h);
  if (pic?.snap) ctx.drawImage(pic.snap.canvas, 0, 0, pic.snap.canvas.width, pic.snap.canvas.height, area.x, area.y, area.w, area.h);

  // "Typical" / "Greater" written on the map.
  if (pic?.snap && opts.areaLabels !== false) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const kx = area.w / pic.snap.canvas.width;
    const ky = area.h / pic.snap.canvas.height;
    for (const [key, text] of [['typical', 'Typical'], ['greater', 'Greater']]) {
      const at = info.month?.labels?.[key];
      if (!at) continue;
      const p = pic.snap.toPoint(at[0], at[1]);
      const x = area.x + p.x * kx;
      const y = area.y + p.y * ky;
      if (y < area.y || y > area.y + area.h) continue;
      ctx.font = `700 ${Math.round(32 * u)}px ${font.head}`;
      const tw = ctx.measureText(text).width + 26 * u;
      const th = 48 * u;
      ctx.fillStyle = colors[key];
      ctx.fillRect(x - tw / 2, y - th / 2, tw, th);
      ctx.lineWidth = 3 * u;
      ctx.strokeStyle = '#fff';
      ctx.strokeRect(x - tw / 2, y - th / 2, tw, th);
      ctx.fillStyle = '#fff';
      ctx.fillText(text, x, y + 1 * u);
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  if (style.id === 'map') {
    // Just the map. The credit stays: the map data's license requires it.
    const fs = Math.round(Math.max(12, 15 * u));
    const text = credit(info);
    fitText(ctx, text, font.body, 400, fs, size.w - 48, 9);
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(11,18,32,0.6)';
    roundRect(ctx, size.w - tw - 32, size.h - fs - 24, tw + 24, fs + 16, 6);
    ctx.fill();
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(text, size.w - tw - 20, size.h - 8 - (fs + 16) / 2);
    ctx.textBaseline = 'alphabetic';
    const logo = logoSize(T.logo, 240 * u, 110 * u);
    if (logo.w) {
      ctx.fillStyle = withAlpha(T.primary, 0.55);
      roundRect(ctx, M - 10 * u, M - 10 * u, logo.w + 20 * u, logo.h + 20 * u, 10 * u);
      ctx.fill();
      ctx.drawImage(T.logo, M, M, logo.w, logo.h);
    }
    return boxes;
  }

  if (style.id === 'risk') {
    // Title tab, then the month on its own tab (movable together).
    const fs = Math.round(40 * u);
    const pad = 22 * u;
    const th = 72 * u;
    const title = opts.headline || ' ';
    const month = opts.subline || '';
    fitText(ctx, title, font.head, headWeight, fs, size.w * 0.62, 14);
    const titleFs = parseInt(ctx.font.match(/(\d+)px/)[1], 10);
    const titleW = ctx.measureText(title).width + pad * 2;
    ctx.font = `${headWeight} ${titleFs}px ${font.head}`;
    const monthW = month ? ctx.measureText(month).width + pad * 2 : 0;
    place('head', titleW + monthW, th, () => [36 * u, 36 * u]);
    const tab = opts.tabColor || colors.typical;
    const mon = opts.monthColor || '#ffffff';
    ctx.fillStyle = tab;
    ctx.fillRect(0, 0, titleW, th);
    ctx.textBaseline = 'middle';
    ctx.font = `${headWeight} ${titleFs}px ${font.head}`;
    ctx.fillStyle = isLight(tab) ? '#0b1220' : '#ffffff';
    ctx.fillText(title, pad, th / 2 + 1 * u);
    if (month) {
      ctx.fillStyle = mon;
      ctx.fillRect(titleW, 0, monthW, th);
      ctx.fillStyle = isLight(mon) ? '#1f2937' : '#ffffff';
      ctx.fillText(month, titleW + pad, th / 2 + 1 * u);
    }
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
    // Logo in the top-right corner.
    const logo = logoSize(T.logo, 220 * u * hd.logoSize, 100 * u * hd.logoSize);
    if (logo.w) {
      ctx.fillStyle = withAlpha(T.primary, 0.6);
      roundRect(ctx, size.w - M - logo.w - 10 * u, M - 10 * u, logo.w + 20 * u, logo.h + 20 * u, 10 * u);
      ctx.fill();
      ctx.drawImage(T.logo, size.w - M - logo.w, M, logo.w, logo.h);
    }
  } else if (style.id === 'clean') {
    const boxH = Math.round(58 * u) + Math.round(30 * u) + 46;
    const logo = logoSize(T.logo, 240 * u * hd.logoSize, (boxH - 24) * hd.logoSize);
    const lw = logo.w ? logo.w + 18 : 0;
    const tb = headerText(ctx, hd, { head: font.head, body: font.body, headWeight, caps: false, subWeight: 600 }, opts.headline, opts.subline, size.w - M * 2 - 44 - lw, Math.round(58 * u), Math.round(30 * u), ICON[info.hazardId]);
    const bw = tb.w + 44 + lw;
    const bh = Math.max(tb.h + 46, logo.h + 24);
    place('head', bw, bh, () => [M, M]);
    ctx.fillStyle = hd.bg === 'auto' ? withAlpha(T.primary, 0.88) : headerFill(ctx, hd, 0, 0, bw, bh, colors.typical);
    roundRect(ctx, 0, 0, bw, bh, 12);
    ctx.fill();
    const aw = hd.accent === 'stripes' ? Math.max(8, hd.accentWidth) : hd.accent === 'color' ? Math.max(3, hd.accentWidth * 0.8) : 5;
    drawAccent(ctx, hd, 0, 14, aw, bh - 28, T.accentSolid);
    if (logo.w) ctx.drawImage(T.logo, 20, (bh - logo.h) / 2, logo.w, logo.h);
    const light = hd.bg === 'auto' ? T.text === '#0b1220' : headerBgLight(hd, colors.typical);
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
      ctx.fillStyle = headerFill(ctx, hd, 0, HY, size.w, HH, colors.typical);
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
    const light = hd.bg === 'auto' ? T.text === '#0b1220' : headerBgLight(hd, colors.typical);
    const tb = headerText(ctx, hd, { head: font.head, body: font.body, headWeight, caps: false, subWeight: 600 }, opts.headline, opts.subline, textW, Math.round(HH * 0.42), Math.round(HH * 0.22), ICON[info.hazardId]);
    const tx = hd.align === 'center' ? textX0 + (textW - tb.w) / 2 : hd.align === 'right' ? textX0 + textW - tb.w : textX0;
    tb.draw(tx, innerY + Math.round((innerH - tb.h) / 2), {
      head: hd.color || (hd.bg === 'auto' ? T.text : light ? '#0b1220' : '#ffffff'),
      sub: hd.subColor || (hd.bg === 'auto' ? T.sub : light ? '#1e293b' : 'rgba(255,255,255,0.85)'),
    });
    Object.defineProperty(boxes, 'regions', { value: { header: { x: 0, y: HY, w: size.w, h: HH } } });
  }

  // Key: what the two areas mean (movable).
  if (opts.key) {
    const fs = Math.round(24 * u);
    const sw = 30 * u;
    const lines = [
      ['greater', 'Greater: the core, about a third of reports'],
      ['typical', 'Typical: three quarters of reports'],
    ];
    ctx.font = `600 ${fs}px ${font.body}`;
    const kw = Math.max(...lines.map(([, t]) => ctx.measureText(t).width)) + sw + 48 * u;
    const kh = lines.length * fs * 1.6 + 28 * u;
    place('key', kw, kh, (w2, h2) => [M, freeBottom - M * 0.6 - h2]);
    ctx.fillStyle = 'rgba(11,18,32,0.82)';
    roundRect(ctx, 0, 0, kw, kh, 10 * u);
    ctx.fill();
    ctx.textBaseline = 'middle';
    lines.forEach(([k, t], i) => {
      const y = 14 * u + fs * 0.8 + i * fs * 1.6;
      ctx.fillStyle = colors[k];
      ctx.fillRect(16 * u, y - fs * 0.4, sw, fs * 0.8);
      ctx.fillStyle = '#e2e8f0';
      ctx.font = `600 ${fs}px ${font.body}`;
      ctx.fillText(t, 16 * u + sw + 14 * u, y);
    });
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  // Footer.
  const fy = style.id === 'clean' ? area.y + area.h : size.h - area.foot;
  const fh = size.h - fy;
  const plain = style.id === 'risk' && !T.branded;
  ctx.fillStyle = plain ? 'rgba(11,18,32,0.95)' : style.id === 'clean' ? withAlpha(T.primary, 0.92) : T.foot;
  ctx.fillRect(0, fy, size.w, fh);
  ctx.textBaseline = 'middle';
  let left = 0;
  if (T.footName) {
    fitText(ctx, T.footName, plain ? font.head : font.body, plain ? 700 : 600, Math.round(Math.max(15, fh * (plain ? 0.46 : 0.4))), size.w * 0.45, 11);
    ctx.fillStyle = plain ? '#ffffff' : T.footText;
    ctx.fillText(T.footName, M, fy + fh / 2);
    left = ctx.measureText(T.footName).width + M;
  }
  const text = credit(info);
  fitText(ctx, text, font.body, 400, Math.round(Math.max(12, fh * 0.28)), size.w - M * 2 - left, 8);
  ctx.fillStyle = plain ? '#cbd5e1' : T.footMuted;
  ctx.textAlign = 'right';
  ctx.fillText(text, size.w - M, fy + fh / 2);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  return boxes;
}

// ---- captions (every number from the page's data)
const join = (list) => (list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}` : list[0] || '');
const fmt = (n) => (n >= 100 ? Math.round(n).toLocaleString('en-US') : String(n));

export function buildCaptions(info, { link, stateName }) {
  const { hazard, monthName, sel, years } = info;
  const short = hazard.noun.split(' (')[0];
  const span = `${years[1] - years[0] + 1} years of NOAA storm records (${years[0]}-${years[1]})`;
  const top = sel.states.slice(0, 3).map(([st]) => stateName(st));
  const tail = link ? `\n\nSee every month: ${link}` : '';
  return [
    {
      id: 'summary',
      label: 'Summary',
      text: `Where ${monthName} ${short} happen most, from ${span}. An average of ${fmt(sel.perYear)} ${hazard.noun} a year in ${monthName}${top.length ? `, most in ${join(top)}` : ''}.${tail}`,
    },
    {
      id: 'short',
      label: 'Short',
      text: `${hazard.title}: ${monthName}. Based on ${span}.${tail}`,
    },
    {
      id: 'states',
      label: 'Top states',
      text:
        `${monthName} ${short}, average per year (${years[0]}-${years[1]}):\n` +
        sel.states.map(([st, n], i) => `${i + 1}. ${stateName(st)}: ${fmt(n)}`).join('\n') +
        tail,
    },
  ];
}
