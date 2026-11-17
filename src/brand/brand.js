// Personal branding for post images: the person's own logo, page name, link
// and colors in place of Weather Spectrum's. Saved in this browser only
// (localStorage); nothing is uploaded anywhere.
import { useEffect, useState } from 'react';

const KEY = 'ws-post-brand';
export const DEFAULT_BRAND = { enabled: false, name: '', link: '', logo: null, primary: '#0b1220', accent: '#f97316' };
const DEFAULT_PRIMARY = DEFAULT_BRAND.primary;
const DEFAULT_ACCENT = DEFAULT_BRAND.accent;

function load() {
  try {
    const b = JSON.parse(localStorage.getItem(KEY) || 'null');
    return b ? { ...DEFAULT_BRAND, ...b } : DEFAULT_BRAND;
  } catch {
    return DEFAULT_BRAND;
  }
}

// [brand, setBrand(patch), { logoImg, saveError }]
export function useBrand() {
  const [brand, setState] = useState(DEFAULT_BRAND);
  const [saveError, setSaveError] = useState(false);
  const [logoImg, setLogoImg] = useState(null);
  useEffect(() => setState(load()), []);
  useEffect(() => {
    if (!brand.logo) return setLogoImg(null);
    let alive = true;
    const img = new Image();
    img.onload = () => alive && setLogoImg(img);
    img.onerror = () => alive && setLogoImg(null);
    img.src = brand.logo;
    return () => {
      alive = false;
    };
  }, [brand.logo]);
  const setBrand = (patch) =>
    setState((b) => {
      const next = { ...b, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
        setSaveError(false);
      } catch {
        setSaveError(true); // still used for this visit
      }
      return next;
    });
  return [brand, setBrand, { logoImg, saveError }];
}

// Shrink an uploaded logo (max 600 px on its longest side) and keep it as a
// PNG data URL, small enough to save in the browser.
export function readLogo(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error('Pick an image file (PNG or JPG).'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 600 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * k));
      c.height = Math.max(1, Math.round(img.naturalHeight * k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That image couldn't be read."));
    };
    img.src = url;
  });
}

// ---- drawing

const rgb = (hex) => {
  const n = parseInt(String(hex).replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export function luminance(hex) {
  const [r, g, b] = rgb(hex).map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const mix = (hex, toward, t) => {
  const a = rgb(hex);
  const b = rgb(toward);
  return `#${a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
};

// The colors and labels a post is drawn with. With branding off this is
// exactly the Weather Spectrum look.
export function postTheme(brand, logoImg) {
  const on = !!brand?.enabled;
  const primary = on ? brand.primary || DEFAULT_PRIMARY : DEFAULT_PRIMARY;
  const accent = on ? brand.accent || DEFAULT_ACCENT : DEFAULT_ACCENT;
  const custom = on && (primary !== DEFAULT_PRIMARY || accent !== DEFAULT_ACCENT);
  const lightHead = luminance(primary) > 0.4;
  const text = lightHead ? '#0b1220' : '#ffffff';
  // Second line: the accent color if it reads well on the header, else the text color.
  const sub = !custom ? '#fcd34d' : contrast(accent, primary) >= 3 ? accent : lightHead ? '#1e293b' : 'rgba(255,255,255,0.85)';
  const name = on ? [brand.name, brand.link].map((s) => (s || '').trim()).filter(Boolean).join(' · ') : 'theweatherspectrum.com';
  return {
    branded: on,
    primary,
    headTop: !custom ? '#111a2e' : mix(primary, lightHead ? '#000000' : '#ffffff', 0.06),
    headBottom: primary,
    text,
    sub,
    foot: primary,
    footText: !custom ? '#fbbf24' : contrast(accent, primary) >= 3 ? accent : text,
    footMuted: lightHead ? '#334155' : '#94a3b8',
    number: !custom ? '#fbbf24' : contrast(accent, '#0b1220') >= 3 ? accent : '#ffffff',
    footName: name, // '' when branded with no name or link
    logo: on ? logoImg || null : null,
    accentFill(ctx, x0, x1) {
      if (custom) return accent;
      const g = ctx.createLinearGradient(x0, 0, x1, 0);
      g.addColorStop(0, '#f97316');
      g.addColorStop(1, '#facc15');
      return g;
    },
    accentSolid: custom ? accent : '#f97316',
  };
}

// Size for a logo that fits in maxW x maxH, keeping its shape.
export function logoSize(img, maxW, maxH) {
  if (!img) return { w: 0, h: 0 };
  const k = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight);
  return { w: Math.round(img.naturalWidth * k), h: Math.round(img.naturalHeight * k) };
}

// '#rrggbb' -> 'rgba(r,g,b,a)'
export const withAlpha = (hex, a) => `rgba(${rgb(hex).join(',')},${a})`;
