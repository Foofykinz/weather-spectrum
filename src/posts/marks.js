// Labels, arrows, circles and logo stamps people add on top of a post's map.
// Positions are stored as map locations (lat/lng), so a mark stays on the same
// spot in every size, every video frame and every map style.
//
// mark: { id, kind: 'label'|'arrow'|'circle'|'logo', a: {lat,lng}, b?: {lat,lng}, text?, color, scale?, style? }
// color: the line color for arrows / circles, the border color for labels.
// style (labels): see LABEL_DEFAULTS; (arrows / circles): { dash, fill }.

export const MARK_COLORS = ['#ffffff', '#facc15', '#f97316', '#ef4444', '#e879f9', '#22d3ee', '#4ade80'];
export const SWATCHES = ['#ffffff', '#0b1220', '#000000', '#facc15', '#f97316', '#ef4444', '#e879f9', '#a78bfa', '#38bdf8', '#22d3ee', '#4ade80', '#94a3b8'];

const SYSTEM = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
// Label fonts ('post' follows the post's own font). Google Fonts load when picked.
export const LABEL_FONTS = [
  { id: 'post', label: 'Same as post' },
  { id: 'system', label: 'Standard', family: SYSTEM },
  { id: 'inter', label: 'Inter', family: '"Inter"', css: 'Inter:ital,wght@0,400;0,700;0,900;1,400;1,700;1,900' },
  { id: 'oswald', label: 'Oswald', family: '"Oswald"', css: 'Oswald:wght@400;700' },
  { id: 'bebas', label: 'Bebas Neue', family: '"Bebas Neue"', css: 'Bebas+Neue' },
  { id: 'anton', label: 'Anton', family: '"Anton"', css: 'Anton' },
  { id: 'slab', label: 'Roboto Slab', family: '"Roboto Slab"', css: 'Roboto+Slab:wght@400;700;900' },
  { id: 'playfair', label: 'Playfair Display', family: '"Playfair Display"', css: 'Playfair+Display:ital,wght@0,400;0,700;0,900;1,400;1,700' },
  { id: 'marker', label: 'Permanent Marker', family: '"Permanent Marker"', css: 'Permanent+Marker' },
];
const fontLoads = new Map();
// Resolves once the font can draw (or failed; the fallback font is used).
export function loadLabelFont(id) {
  const f = LABEL_FONTS.find((x) => x.id === id);
  if (!f?.css) return Promise.resolve(true);
  if (!fontLoads.has(id)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${f.css}&display=swap`;
    const p = new Promise((res) => {
      link.onload = res;
      link.onerror = res;
    })
      .then(() => Promise.all([document.fonts.load(`400 40px ${f.family}`), document.fonts.load(`700 40px ${f.family}`)]))
      .then(() => true, () => false);
    document.head.appendChild(link);
    fontLoads.set(id, p);
  }
  return fontLoads.get(id);
}

// Label look. Everything is optional on a mark; these are the defaults (the
// original label: dark box, colored border, white bold text).
export const LABEL_DEFAULTS = {
  fontId: 'post',
  weight: 700, // 400 | 700 | 900
  italic: false,
  caps: false,
  align: 'center', // left | center | right
  spacing: 0, // letter spacing, in ems
  fg: '#ffffff',
  bg: 'box', // none | box | pill | highlight
  bgColor: '#0b1220',
  bgOpacity: 0.88,
  radius: 0.3, // corner roundness, 0..1
  pad: 1, // padding scale
  border: true,
  borderWidth: 3,
  effect: 'none', // none | shadow | outline | glow
  effectColor: '#000000',
  rotate: 0, // degrees
  opacity: 1,
};

// One-tap looks.
export const LABEL_PRESETS = [
  { id: 'classic', label: 'Classic', style: {}, color: '#facc15' },
  { id: 'clean', label: 'Clean', style: { bg: 'none', border: false, effect: 'shadow', fg: '#ffffff' } },
  { id: 'outline', label: 'Outline', style: { bg: 'none', border: false, effect: 'outline', effectColor: '#000000', fg: '#ffffff', weight: 900 } },
  { id: 'tag', label: 'Bold tag', style: { bg: 'box', bgColor: '#facc15', bgOpacity: 1, fg: '#0b1220', border: false, weight: 900, caps: true, radius: 0.15 } },
  { id: 'alert', label: 'Alert', style: { bg: 'box', bgColor: '#dc2626', bgOpacity: 1, fg: '#ffffff', border: false, weight: 900, caps: true, radius: 0.1, effect: 'none' } },
  { id: 'highlight', label: 'Highlight', style: { bg: 'highlight', bgColor: '#ffffff', bgOpacity: 1, fg: '#0b1220', border: false, radius: 0.2 } },
  { id: 'glass', label: 'Glass', style: { bg: 'pill', bgColor: '#0b1220', bgOpacity: 0.55, fg: '#ffffff', border: true, borderWidth: 1.5, weight: 400 } },
];

export const labelStyle = (m) => ({ ...LABEL_DEFAULTS, ...(m.style || {}) });
const familyOf = (st, postFont) => (st.fontId && st.fontId !== 'post' ? LABEL_FONTS.find((f) => f.id === st.fontId)?.family || postFont : postFont);
const hexA = (hex, a) => {
  const n = parseInt(String(hex).slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

// view: how a map location lands on this post canvas.
// snap: snapshot with toPoint/toLatLng; src: the part of the snapshot drawn
// (in snapshot pixels); area: where it's drawn on the post.
export function makeView(snap, src, area) {
  const kx = area.w / src.w;
  const ky = area.h / src.h;
  return {
    area,
    toCanvas(ll) {
      const p = snap.toPoint(ll.lat, ll.lng);
      return { x: area.x + (p.x - src.x) * kx, y: area.y + (p.y - src.y) * ky };
    },
    toLatLng(x, y) {
      const ll = snap.toLatLng(src.x + (x - area.x) / kx, src.y + (y - area.y) / ky);
      return { lat: ll.lat, lng: ll.lng };
    },
  };
}

const unit = (canvas) => canvas.width / 1080;

// Sets the label's font on ctx and measures it. Box centered on p (before rotation).
function labelBox(ctx, m, p, u, font) {
  const st = labelStyle(m);
  const fs = Math.round(34 * u * (m.scale || 1));
  ctx.font = `${st.italic ? 'italic ' : ''}${st.weight} ${fs}px ${familyOf(st, font)}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${(st.spacing * fs).toFixed(1)}px`;
  const raw = String(m.text || ' ');
  const lines = (st.caps ? raw.toUpperCase() : raw).split('\n').slice(0, 6);
  const widths = lines.map((l) => ctx.measureText(l).width);
  const padX = fs * 0.55 * st.pad;
  const padY = fs * 0.3 * st.pad;
  const w = Math.max(...widths) + padX * 2;
  const lh = fs * 1.2;
  const h = lines.length * lh + padY * 2;
  return { x: p.x - w / 2, y: p.y - h / 2, w, h, fs, lh, lines, widths, padX, padY, st };
}

// Axis-aligned bounds of a box rotated about its center.
function rotatedBounds(b, deg) {
  if (!deg) return b;
  const r = (deg * Math.PI) / 180;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  const w = b.w * c + b.h * s;
  const h = b.w * s + b.h * c;
  return { ...b, x: b.x + b.w / 2 - w / 2, y: b.y + b.h / 2 - h / 2, w, h };
}

function drawLabel(ctx, m, p, u, font) {
  const box = labelBox(ctx, m, p, u, font);
  const { st, fs, lh, lines, widths, padX, padY } = box;
  ctx.save();
  ctx.globalAlpha = st.opacity;
  ctx.translate(p.x, p.y);
  ctx.rotate((st.rotate * Math.PI) / 180);
  const x0 = -box.w / 2;
  const y0 = -box.h / 2;
  const radius = st.bg === 'pill' ? Math.min(box.h, box.w) / 2 : st.radius * fs * 0.8;
  const bw = st.borderWidth * u;
  if (st.bg === 'box' || st.bg === 'pill') {
    ctx.fillStyle = hexA(st.bgColor, st.bgOpacity);
    rounded(ctx, x0, y0, box.w, box.h, Math.min(radius, box.h / 2, box.w / 2));
    ctx.fill();
    if (st.border && bw > 0) {
      ctx.strokeStyle = m.color;
      ctx.lineWidth = bw;
      ctx.stroke();
    }
  } else if (st.bg === 'highlight') {
    // A band behind each line, like a marker highlight.
    lines.forEach((l, i) => {
      const lw = widths[i] + padX * 1.2;
      const lx = st.align === 'left' ? x0 + padX * 0.4 : st.align === 'right' ? -x0 - padX * 0.4 - lw : -lw / 2;
      const ly = y0 + padY + i * lh;
      ctx.fillStyle = hexA(st.bgColor, st.bgOpacity);
      rounded(ctx, lx, ly, lw, lh, Math.min(st.radius * fs * 0.6, lh / 2));
      ctx.fill();
      if (st.border && bw > 0) {
        ctx.strokeStyle = m.color;
        ctx.lineWidth = bw;
        ctx.stroke();
      }
    });
  } else if (st.border && bw > 0) {
    // No background, border only.
    ctx.strokeStyle = m.color;
    ctx.lineWidth = bw;
    rounded(ctx, x0, y0, box.w, box.h, Math.min(radius, box.h / 2, box.w / 2));
    ctx.stroke();
  }
  ctx.textAlign = st.align;
  ctx.textBaseline = 'middle';
  const tx = st.align === 'left' ? x0 + padX : st.align === 'right' ? -x0 - padX : 0;
  const ty = (i) => y0 + padY + lh * (i + 0.5) + fs * 0.04;
  if (st.effect === 'outline') {
    ctx.strokeStyle = st.effectColor;
    ctx.lineWidth = fs * 0.16;
    ctx.lineJoin = 'round';
    lines.forEach((l, i) => ctx.strokeText(l, tx, ty(i)));
  }
  if (st.effect === 'shadow') {
    ctx.shadowColor = hexA(st.effectColor, 0.85);
    ctx.shadowBlur = fs * 0.25;
    ctx.shadowOffsetY = fs * 0.06;
  } else if (st.effect === 'glow') {
    ctx.shadowColor = st.effectColor === '#000000' ? st.fg : st.effectColor;
    ctx.shadowBlur = fs * 0.55;
    ctx.fillStyle = st.fg;
    lines.forEach((l, i) => ctx.fillText(l, tx, ty(i)));
  }
  ctx.fillStyle = st.fg;
  lines.forEach((l, i) => ctx.fillText(l, tx, ty(i)));
  ctx.restore();
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

function logoBox(m, p, u, logoImg) {
  const max = 200 * u * (m.scale || 1);
  const k = Math.min(max / logoImg.naturalWidth, max / logoImg.naturalHeight);
  const w = logoImg.naturalWidth * k;
  const h = logoImg.naturalHeight * k;
  return { x: p.x - w / 2, y: p.y - h / 2, w, h };
}

function rounded(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Arrow styles: style.arrow = classic | curved | double | open | block;
// style.bend (-1..1) bends a curved arrow to one side or the other.
export const ARROW_STYLES = [
  ['classic', 'Classic'],
  ['curved', 'Curved'],
  ['double', 'Double'],
  ['open', 'Open head'],
  ['block', 'Block'],
];

function drawArrow(ctx, m, a, b, u) {
  const st = m.style || {};
  const kind = st.arrow || 'classic';
  const lw = 8 * u * (m.scale || 1);
  const casing = 6 * u;
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  // Curved: a quadratic bend through a control point off to one side.
  const bend = kind === 'curved' ? (st.bend ?? 0.35) : 0;
  const c = { x: (a.x + b.x) / 2 - ((b.y - a.y) / len) * bend * len * 0.5, y: (a.y + b.y) / 2 + ((b.x - a.x) / len) * bend * len * 0.5 };
  const endFrom = bend ? c : a; // the head points along the curve's last stretch
  const startFrom = bend ? c : b;
  const headLen = lw * 3.6;
  const twoHeads = kind === 'double';
  const dash = st.dash ? [lw * 2.2, lw * 1.8] : [];

  if (kind === 'block') {
    // A solid arrow shape: a wide shaft and a wider head.
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const sw = lw * 1.3;
    const hw = lw * 3.2;
    const hl = Math.min(len * 0.6, lw * 4.5);
    const pts = [
      [0, -sw], [len - hl, -sw], [len - hl, -hw], [len, 0], [len - hl, hw], [len - hl, sw], [0, sw],
    ].map(([x, y]) => [a.x + x * Math.cos(ang) - y * Math.sin(ang), a.y + x * Math.sin(ang) + y * Math.cos(ang)]);
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.lineWidth = casing;
    ctx.stroke();
    ctx.fillStyle = m.color;
    ctx.fill();
    return;
  }

  // The shaft stops short of a filled head so the tip stays sharp.
  const trim = (p, from) => {
    if (kind === 'open') return p;
    const d = Math.hypot(p.x - from.x, p.y - from.y) || 1;
    const back = Math.min(d, lw * 2);
    return { x: p.x - ((p.x - from.x) / d) * back, y: p.y - ((p.y - from.y) / d) * back };
  };
  const s0 = twoHeads ? trim(a, startFrom) : a;
  const s1 = trim(b, endFrom);
  const shaft = () => {
    ctx.beginPath();
    ctx.moveTo(s0.x, s0.y);
    if (bend) ctx.quadraticCurveTo(c.x, c.y, s1.x, s1.y);
    else ctx.lineTo(s1.x, s1.y);
  };
  const heads = [[endFrom, b], ...(twoHeads ? [[startFrom, a]] : [])];
  const head = (from, tip) => {
    const ang = Math.atan2(tip.y - from.y, tip.x - from.x);
    ctx.beginPath();
    if (kind === 'open') {
      ctx.moveTo(tip.x - headLen * Math.cos(ang - 0.55), tip.y - headLen * Math.sin(ang - 0.55));
      ctx.lineTo(tip.x, tip.y);
      ctx.lineTo(tip.x - headLen * Math.cos(ang + 0.55), tip.y - headLen * Math.sin(ang + 0.55));
    } else {
      ctx.moveTo(tip.x, tip.y);
      ctx.lineTo(tip.x - headLen * Math.cos(ang - 0.45), tip.y - headLen * Math.sin(ang - 0.45));
      ctx.lineTo(tip.x - headLen * Math.cos(ang + 0.45), tip.y - headLen * Math.sin(ang + 0.45));
      ctx.closePath();
    }
  };
  // Dark casing first, then the color on top.
  ctx.setLineDash(dash);
  shaft();
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.lineWidth = lw + casing;
  ctx.stroke();
  ctx.setLineDash([]);
  for (const [f, t] of heads) {
    head(f, t);
    ctx.lineWidth = kind === 'open' ? lw + casing : casing;
    ctx.stroke();
  }
  ctx.setLineDash(dash);
  shaft();
  ctx.strokeStyle = m.color;
  ctx.lineWidth = lw;
  ctx.stroke();
  ctx.setLineDash([]);
  for (const [f, t] of heads) {
    head(f, t);
    if (kind === 'open') {
      ctx.lineWidth = lw;
      ctx.stroke();
    } else {
      ctx.fillStyle = m.color;
      ctx.fill();
    }
  }
}

// Draws the marks, kept inside the map part of the post.
export function drawMarks(canvas, marks, view, { font = 'system-ui, sans-serif', logoImg } = {}) {
  if (!marks?.length || !view) return;
  const ctx = canvas.getContext('2d');
  const u = unit(canvas);
  const { area } = view;
  ctx.save();
  ctx.beginPath();
  ctx.rect(area.x, area.y, area.w, area.h);
  ctx.clip();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const m of marks) {
    const a = view.toCanvas(m.a);
    if (m.kind === 'arrow') {
      drawArrow(ctx, m, a, view.toCanvas(m.b), u);
    } else if (m.kind === 'circle') {
      const b = view.toCanvas(m.b);
      const lw = 8 * u * (m.scale || 1);
      const path = () => {
        ctx.beginPath();
        ctx.arc(a.x, a.y, Math.max(6 * u, Math.hypot(b.x - a.x, b.y - a.y)), 0, Math.PI * 2);
      };
      const st = m.style || {};
      if (m.kind === 'circle' && st.fill) {
        path();
        ctx.fillStyle = hexA(m.color, 0.2);
        ctx.fill();
      }
      ctx.setLineDash(st.dash ? [lw * 2.2, lw * 1.8] : []);
      path();
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.lineWidth = lw + 6 * u;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.setLineDash(st.dash ? [lw * 2.2, lw * 1.8] : []);
      path();
      ctx.strokeStyle = m.color;
      ctx.lineWidth = lw;
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (m.kind === 'label') {
      drawLabel(ctx, m, a, u, font);
    } else if (m.kind === 'logo' && logoImg) {
      const box = logoBox(m, a, u, logoImg);
      ctx.drawImage(logoImg, box.x, box.y, box.w, box.h);
    }
  }
  ctx.restore();
}

// Outline of a mark on the canvas (for the selection box and tapping).
export function markBounds(canvas, m, view, { font = 'system-ui, sans-serif', logoImg } = {}) {
  const u = unit(canvas);
  const a = view.toCanvas(m.a);
  if (m.kind === 'label') {
    const ctx = canvas.getContext('2d');
    ctx.save();
    const b = labelBox(ctx, m, a, u, font);
    ctx.restore();
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    return rotatedBounds(b, b.st.rotate);
  }
  if (m.kind === 'logo') return logoImg ? logoBox(m, a, u, logoImg) : { x: a.x - 20, y: a.y - 20, w: 40, h: 40 };
  const b = view.toCanvas(m.b);
  if (m.kind === 'circle') {
    const r = Math.hypot(b.x - a.x, b.y - a.y);
    return { x: a.x - r, y: a.y - r, w: r * 2, h: r * 2 };
  }
  const pad = 14 * u;
  return { x: Math.min(a.x, b.x) - pad, y: Math.min(a.y, b.y) - pad, w: Math.abs(b.x - a.x) + pad * 2, h: Math.abs(b.y - a.y) + pad * 2 };
}

// Which mark (and which part) is under canvas point (x, y). Newest on top.
export function hitMark(canvas, marks, view, x, y, opts) {
  const u = unit(canvas);
  const near = 28 * u;
  for (let i = marks.length - 1; i >= 0; i--) {
    const m = marks[i];
    const a = view.toCanvas(m.a);
    if (m.kind === 'arrow' || m.kind === 'circle') {
      const b = view.toCanvas(m.b);
      if (Math.hypot(x - b.x, y - b.y) < near) return { id: m.id, part: 'b' };
      if (m.kind === 'arrow') {
        const L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2 || 1;
        const t = Math.max(0, Math.min(1, ((x - a.x) * (b.x - a.x) + (y - a.y) * (b.y - a.y)) / L2));
        if (Math.hypot(x - (a.x + t * (b.x - a.x)), y - (a.y + t * (b.y - a.y))) < near) return { id: m.id, part: 'all' };
      } else {
        const r = Math.hypot(b.x - a.x, b.y - a.y);
        if (Math.abs(Math.hypot(x - a.x, y - a.y) - r) < near || Math.hypot(x - a.x, y - a.y) < near) return { id: m.id, part: 'all' };
      }
    } else {
      const r = markBounds(canvas, m, view, opts);
      if (x >= r.x - 6 && x <= r.x + r.w + 6 && y >= r.y - 6 && y <= r.y + r.h + 6) return { id: m.id, part: 'all' };
    }
  }
  return null;
}
