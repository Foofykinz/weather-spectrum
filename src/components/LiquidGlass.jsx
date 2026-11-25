import { useEffect } from 'react';

// Liquid glass for the controls that float over the radar: the panel's rim
// bends and magnifies the map behind it, like a thick piece of rounded glass,
// with a light rim on top.
//
// How (after kube.io's write-up "Liquid Glass in the Browser: Refraction with
// CSS and SVG"; this is our own implementation): for each element we draw a
// displacement map the exact size of the element. Every pixel near the edge
// gets a vector pointing out of the panel, strongest at the rim and fading to
// nothing a bezel's width in (a rounded "squircle" glass profile), encoded in
// the red/green channels. An SVG filter (feImage + feDisplacementMap) moves
// the backdrop by those vectors, and the element uses it as its
// backdrop-filter.
//
// Only Chromium browsers (Chrome, Edge, Brave, Opera) apply SVG filters as a
// backdrop-filter; everywhere else nothing changes and the element keeps its
// frosted blur from index.css (translucent card, Gaussian blur behind it).
// Elements opt in with the class "ws-glass". The map for a size
// is made once and shared by every element of that size.

const supported = () =>
  typeof navigator !== 'undefined' &&
  !!navigator.userAgentData?.brands?.some((b) => /Chromium/.test(b.brand)) &&
  CSS.supports('backdrop-filter', 'blur(1px)') &&
  typeof OffscreenCanvas === 'function';

const SVG_NS = 'http://www.w3.org/2000/svg';
const BLUR = 5; // px: frosted-glass blur behind the card (index.css uses the same look elsewhere)

export function useLiquidGlass() {
  useEffect(() => {
    if (!supported()) return undefined;
    document.documentElement.classList.add('ws-liquid');
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    svg.setAttribute('color-interpolation-filters', 'sRGB');
    const defs = document.createElementNS(SVG_NS, 'defs');
    svg.appendChild(defs);
    document.body.appendChild(svg);

    // Maps are made per size, in the background, and shared. Sizes are rounded
    // up to 4 px (the map is stretched to the element) so a card whose text
    // changes width by a few pixels reuses its map. At most MAX_FILTERS are kept.
    const MAX_FILTERS = 24;
    const filters = new Map(); // key -> { id, url, el } (insertion order = age)
    const waiting = new Map(); // key -> elements waiting for that map
    let nextId = 0;
    const keyOf = (w, h, r) => `${w}x${h}x${r}`;

    // Maps are made in a worker (radar/glassWorker.js): the page only receives finished images.
    const worker = new Worker(new URL('../radar/glassWorker.js', import.meta.url), { type: 'module' });
    const sizesOf = new Map(); // key -> [w, h]
    worker.onmessage = ({ data: { key, blob, scale, failed } }) => {
      const [w, h] = sizesOf.get(key) || [];
      if (failed || !blob || !w || !svg.isConnected) {
        waiting.delete(key);
        return;
      }
      {
        const id = `ws-glass-${nextId++}`;
        const url = URL.createObjectURL(blob);
        const f = document.createElementNS(SVG_NS, 'filter');
        f.setAttribute('id', id);
        f.setAttribute('x', '0');
        f.setAttribute('y', '0');
        f.setAttribute('width', String(w));
        f.setAttribute('height', String(h));
        f.setAttribute('filterUnits', 'userSpaceOnUse');
        f.setAttribute('primitiveUnits', 'userSpaceOnUse');
        f.innerHTML =
          `<feImage href="${url}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="map"/>` +
          `<feDisplacementMap in="SourceGraphic" in2="map" scale="${scale}" xChannelSelector="R" yChannelSelector="G" result="bent"/>` +
          // Frosted inside: a Gaussian blur of the bent backdrop, colors a little richer.
          `<feGaussianBlur in="bent" stdDeviation="${BLUR}" result="soft"/>` +
          '<feColorMatrix in="soft" type="saturate" values="1.5"/>';
        defs.appendChild(f);
        filters.set(key, { id, url, el: f });
        (waiting.get(key) || []).forEach((el) => el.isConnected && el.dataset.glassKey === key && (el.style.backdropFilter = `url(#${id})`));
        waiting.delete(key);
        // Drop the oldest maps no element uses any more.
        const inUse = new Set([...watched].map((el) => el.dataset.glassKey));
        for (const [k, v] of filters) {
          if (filters.size <= MAX_FILTERS) break;
          if (inUse.has(k)) continue;
          v.el.remove();
          URL.revokeObjectURL(v.url);
          filters.delete(k);
        }
      }
    };
    const makeFilter = (w, h, r) => {
      const key = keyOf(w, h, r);
      sizesOf.set(key, [w, h]);
      worker.postMessage({ key, w, h, r });
    };

    const apply = (el) => {
      const w = Math.ceil(el.offsetWidth / 4) * 4;
      const h = Math.ceil(el.offsetHeight / 4) * 4;
      if (w < 8 || h < 8 || w > 1200 || h > 400) return;
      const r = Math.min(Math.round(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0), Math.floor(h / 2));
      const key = keyOf(w, h, r);
      if (el.dataset.glassKey === key) return;
      el.dataset.glassKey = key;
      const made = filters.get(key);
      if (made) {
        el.style.backdropFilter = `url(#${made.id})`;
        return;
      }
      // Until its map is ready the element keeps the plain frosted blur.
      if (waiting.has(key)) waiting.get(key).push(el);
      else {
        waiting.set(key, [el]);
        makeFilter(w, h, r);
      }
    };
    const sizes = new ResizeObserver((entries) => entries.forEach((e) => apply(e.target)));
    const watched = new Set();
    const scan = () => {
      document.querySelectorAll('.ws-glass').forEach((el) => {
        if (watched.has(el)) return;
        watched.add(el);
        sizes.observe(el);
        apply(el);
      });
      watched.forEach((el) => {
        if (!el.isConnected) {
          sizes.unobserve(el);
          watched.delete(el);
        }
      });
    };
    scan();
    // The map adds and removes tile images constantly: look for new glass
    // elements at most a few times a second, not on every change.
    let scanTimer = 0;
    const added = new MutationObserver(() => {
      if (!scanTimer) scanTimer = setTimeout(() => {
        scanTimer = 0;
        scan();
      }, 250);
    });
    added.observe(document.body, { childList: true, subtree: true });

    return () => {
      clearTimeout(scanTimer);
      worker.terminate();
      added.disconnect();
      sizes.disconnect();
      watched.forEach((el) => {
        el.style.backdropFilter = '';
        delete el.dataset.glassKey;
      });
      filters.forEach((v) => URL.revokeObjectURL(v.url));
      svg.remove();
      document.documentElement.classList.remove('ws-liquid');
    };
  }, []);
}
