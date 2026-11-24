// The post's header (the band with the headline, or the headline box in the
// Clean style): every option the viewer can change. With the defaults
// ('auto' everywhere) it draws exactly the original header.

import { LABEL_FONTS } from '../posts/marks';

export const HEADER_DEFAULTS = {
  // text
  font: 'post', // 'post' = the post's font, else a LABEL_FONTS id
  size: 1,
  weight: null, // null = the font's usual heading weight; else 400 | 700 | 900
  italic: false,
  caps: null, // null = auto (caps in the Alert style)
  color: '', // '' = auto
  spacing: 0, // letter spacing, ems
  effect: 'none', // none | shadow | outline | glow
  effectColor: '#000000',
  // second line
  sub: true,
  subSize: 1,
  subColor: '',
  // tag pill and icon
  tag: '',
  tagColor: '#dc2626',
  icon: false,
  // background
  bg: 'auto', // auto | solid | gradient | warning | glass
  bgColor: '#0b1220',
  bgColor2: '#1d4ed8',
  gradDir: 'h', // h | v
  bgOpacity: 0.6, // glass
  // accent stripe
  accent: 'auto', // auto | off | color | stripes
  accentColor: '#38bdf8',
  accentWidth: 6,
  // layout (header band styles only)
  position: 'top', // top | bottom
  height: 1,
  align: 'left', // left | center | right
  logoSide: 'right',
  logoSize: 1,
};

export const HEADER_PRESETS = [
  { id: 'standard', label: 'Standard', hd: {} },
  { id: 'warning', label: 'Warning color', hd: { bg: 'warning', caps: true, icon: true } },
  { id: 'breaking', label: 'Breaking news', hd: { bg: 'solid', bgColor: '#b91c1c', accent: 'color', accentColor: '#ffffff', accentWidth: 4, caps: true, weight: 900, tag: 'BREAKING', tagColor: '#0b1220', icon: true } },
  { id: 'minimal', label: 'Minimal', hd: { bg: 'solid', bgColor: '#0b1220', accent: 'off', font: 'inter', weight: 700, subColor: '#94a3b8' } },
  { id: 'lowerthird', label: 'Lower third', hd: { position: 'bottom', bg: 'gradient', bgColor: '#0b1220', bgColor2: '#1d4ed8', accent: 'color', accentColor: '#facc15', icon: true } },
  { id: 'caution', label: 'Caution tape', hd: { bg: 'solid', bgColor: '#111111', accent: 'stripes', accentWidth: 16, color: '#facc15', caps: true, font: 'anton', weight: 400, icon: true } },
  { id: 'glass', label: 'Glass', hd: { bg: 'glass', bgColor: '#0b1220', bgOpacity: 0.55, accent: 'off', effect: 'shadow', align: 'center' } },
];
export const HEADER_TAGS = ['BREAKING', 'UPDATE', 'LIVE', 'NEW', 'WATCH', 'ALERT'];

export const headerStyle = (h) => ({ ...HEADER_DEFAULTS, ...(h || {}) });

// ---- icons (24 x 24 line drawings)
const ICONS = {
  tornado: ['M21 4H3', 'M18 8H6', 'M19 12H9', 'M16 16h-6', 'M12 20H9'],
  snow: ['M12 2v20', 'M3.3 7l17.4 10', 'M3.3 17L20.7 7', 'M9 4l3 2.5L15 4', 'M9 20l3-2.5 3 2.5', 'M3.8 10.5l3.4 1.5-.6 3.6', 'M20.2 13.5l-3.4-1.5.6-3.6', 'M3.8 13.5l3.4-1.5-.6-3.6', 'M20.2 10.5l-3.4 1.5.6 3.6'],
  wind: ['M3 8h11a3 3 0 1 0-3-3', 'M3 12h16a3 3 0 1 1-3 3', 'M3 16h8'],
  storm: ['M13 2L4 14h7l-1 8 9-12h-7z'],
  flood: ['M2 7c2-2 4-2 6 0s4 2 6 0 4-2 6 0', 'M2 12c2-2 4-2 6 0s4 2 6 0 4-2 6 0', 'M2 17c2-2 4-2 6 0s4 2 6 0 4-2 6 0'],
  alert: ['M12 3L2 20h20z', 'M12 9v5', 'M12 17h.01'],
  radar: ['M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0', 'M7 12a5 5 0 1 0 10 0a5 5 0 1 0-10 0', 'M12 12l7-7'],
};
const ICON_OF = { TO: 'tornado', SV: 'storm', EW: 'wind', HW: 'wind', WI: 'wind', DS: 'wind', FF: 'flood', FA: 'flood', FL: 'flood', MA: 'flood', SQ: 'snow', WS: 'snow', WW: 'snow', BZ: 'snow', LE: 'snow', IS: 'snow' };
export const iconFor = (alert) => (alert ? ICON_OF[alert.type?.phen] || 'alert' : 'radar');

function drawIcon(ctx, name, x, y, s, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s / 24, s / 24);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2.3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const d of ICONS[name] || ICONS.alert) {
    const p = new Path2D(d);
    if (name === 'storm') ctx.fill(p);
    else ctx.stroke(p);
  }
  ctx.restore();
}

const SYSTEM = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
export const headerFamily = (hd, postHead) => (hd.font && hd.font !== 'post' ? LABEL_FONTS.find((f) => f.id === hd.font)?.family || postHead : postHead);

const lum = (hex) => {
  const n = parseInt(String(hex).slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const isLight = (hex) => /^#[0-9a-f]{6}$/i.test(hex || '') && lum(hex) > 0.4;
export const rgba = (hex, a) => {
  const n = parseInt(String(hex).slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

// Fill for a header background. kind: the bg option; w, h: its size; x, y: its corner.
export function headerFill(ctx, hd, x, y, w, h, warnColor) {
  if (hd.bg === 'gradient') {
    const g = hd.gradDir === 'v' ? ctx.createLinearGradient(x, y, x, y + h) : ctx.createLinearGradient(x, y, x + w, y);
    g.addColorStop(0, hd.bgColor);
    g.addColorStop(1, hd.bgColor2);
    return g;
  }
  if (hd.bg === 'warning') return warnColor || hd.bgColor;
  if (hd.bg === 'glass') return rgba(hd.bgColor, hd.bgOpacity);
  return hd.bgColor;
}
// Is that background light (so the text should be dark)?
export function headerBgLight(hd, warnColor) {
  if (hd.bg === 'glass') return false;
  if (hd.bg === 'warning') return isLight(warnColor || hd.bgColor);
  if (hd.bg === 'gradient') return isLight(hd.bgColor) && isLight(hd.bgColor2);
  return isLight(hd.bgColor);
}

// Accent stripe: a band of color or yellow / black hazard stripes.
export function drawAccent(ctx, hd, x, y, w, h, autoFill) {
  if (hd.accent === 'off' || h <= 0) return;
  if (hd.accent === 'stripes') {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.fillStyle = '#111111';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#facc15';
    const step = Math.max(h, 12) * 2;
    for (let sx = x - h - step; sx < x + w + h; sx += step) {
      ctx.beginPath();
      ctx.moveTo(sx, y + h);
      ctx.lineTo(sx + step / 2, y + h);
      ctx.lineTo(sx + step / 2 + h, y);
      ctx.lineTo(sx + h, y);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    return;
  }
  ctx.fillStyle = hd.accent === 'color' ? hd.accentColor : autoFill;
  ctx.fillRect(x, y, w, h);
}

// Lays out icon + tag + headline over the second line, fitted to maxW.
// fonts: { head, body, headWeight, caps, subWeight? } (the post's own); maxima in px.
// Returns { w, h, draw(x, y, colors: { head, sub, icon }) } with x, y the
// block's top-left.
export function headerText(ctx, hd, fonts, headline, subline, maxW, hsMax, ssMax, alert) {
  const fam = headerFamily(hd, fonts.head);
  const weight = hd.weight || fonts.headWeight;
  const caps = hd.caps ?? fonts.caps;
  const head = caps ? headline.toUpperCase() : headline;
  const tag = (hd.tag || '').trim().toUpperCase();
  const subOn = hd.sub && subline;
  const fontAt = (s) => `${hd.italic ? 'italic ' : ''}${weight} ${s}px ${fam}`;
  const spacing = (s) => {
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${(hd.spacing * s).toFixed(1)}px`;
  };
  const measure = (s) => {
    ctx.font = fontAt(s);
    spacing(s);
    const headW = ctx.measureText(head).width;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    const iconW = hd.icon ? s * 1.3 : 0;
    ctx.font = `800 ${Math.round(s * 0.42)}px ${SYSTEM}`;
    const tagW = tag ? ctx.measureText(tag).width + s * 0.5 + s * 0.3 : 0;
    return { headW, iconW, tagW };
  };
  let hs = Math.round(hsMax * hd.size);
  let m = measure(hs);
  while (hs > 14 && m.iconW + m.tagW + m.headW > maxW) {
    hs -= 2;
    m = measure(hs);
  }
  let ss = subOn ? Math.round(ssMax * hd.subSize) : 0;
  let subW = 0;
  if (subOn) {
    for (; ss > 11; ss -= 1) {
      ctx.font = `${fonts.subWeight || 400} ${ss}px ${fonts.body}`;
      subW = ctx.measureText(subline).width;
      if (subW <= maxW - m.iconW) break;
    }
  }
  const gap = subOn ? Math.max(4, Math.round(hs * 0.1)) : 0;
  const h = hs + gap + ss;
  const w = m.iconW + Math.max(m.tagW + m.headW, subW);
  return {
    w,
    h,
    hs,
    ss,
    draw(x, y, colors) {
      ctx.save();
      ctx.textBaseline = 'top';
      if (hd.icon) {
        const is = Math.min(h * 0.95, hs * 1.15);
        drawIcon(ctx, iconFor(alert), x, y + (h - is) / 2, is, colors.icon || colors.head);
      }
      let tx = x + m.iconW;
      if (tag) {
        const th = Math.round(hs * 0.7);
        const tw = m.tagW - hs * 0.3;
        const ty = y + (hs - th) / 2;
        ctx.fillStyle = hd.tagColor;
        ctx.beginPath();
        const r = th * 0.25;
        ctx.moveTo(tx + r, ty);
        ctx.arcTo(tx + tw, ty, tx + tw, ty + th, r);
        ctx.arcTo(tx + tw, ty + th, tx, ty + th, r);
        ctx.arcTo(tx, ty + th, tx, ty, r);
        ctx.arcTo(tx, ty, tx + tw, ty, r);
        ctx.fill();
        ctx.fillStyle = isLight(hd.tagColor) ? '#0b1220' : '#ffffff';
        ctx.font = `800 ${Math.round(hs * 0.42)}px ${SYSTEM}`;
        ctx.textBaseline = 'middle';
        ctx.fillText(tag, tx + hs * 0.25, ty + th / 2 + 1);
        ctx.textBaseline = 'top';
        tx += m.tagW;
      }
      ctx.font = fontAt(hs);
      spacing(hs);
      if (hd.effect === 'outline') {
        ctx.strokeStyle = hd.effectColor;
        ctx.lineWidth = hs * 0.14;
        ctx.lineJoin = 'round';
        ctx.strokeText(head, tx, y);
      }
      if (hd.effect === 'shadow') {
        ctx.shadowColor = rgba(hd.effectColor, 0.85);
        ctx.shadowBlur = hs * 0.22;
        ctx.shadowOffsetY = hs * 0.05;
      } else if (hd.effect === 'glow') {
        ctx.shadowColor = hd.effectColor === '#000000' ? colors.head : hd.effectColor;
        ctx.shadowBlur = hs * 0.5;
        ctx.fillStyle = colors.head;
        ctx.fillText(head, tx, y);
      }
      ctx.fillStyle = colors.head;
      ctx.fillText(head, tx, y);
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
      ctx.shadowColor = 'transparent';
      if (subOn) {
        ctx.font = `${fonts.subWeight || 400} ${ss}px ${fonts.body}`;
        ctx.fillStyle = colors.sub;
        ctx.fillText(subline, x + m.iconW, y + hs + gap);
      }
      ctx.restore();
    },
  };
}
