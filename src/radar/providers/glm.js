// GOES GLM lightning flashes, served by Weather Spectrum's GLM Worker
// (glm-worker/), which extracts them from NOAA's public GOES-19/18 Level 2 data.
//
// Delivery: the first load fetches the whole last-15-minutes window in one
// file; after that, a small index is checked shortly after each once-a-minute
// update (see GlmLayer) and only new 20-second chunks are downloaded (about
// six per minute across both satellites, a few KB each).

export const GLM_BASE = (import.meta.env.VITE_GLM_URL || 'https://weather-spectrum-glm.alysonwalters22.workers.dev').replace(/\/$/, '');

export const GLM_ATTRIBUTION =
  'Lightning: <a href="https://www.goes-r.gov/spacesegment/glm.html" target="_blank" rel="noopener noreferrer">NOAA GOES-19/18 GLM</a>';

export const GLM_WINDOW_MS = 15 * 60 * 1000;

// Keeps the flashes of the last 15 minutes, chunk by chunk.
export function createGlmStore() {
  const chunks = new Map(); // path -> { sat, start, end, flashes: [[lat, lon, timeMs], ...] }

  const add = (c) => {
    const t0 = Date.parse(c.start);
    chunks.set(c.path, { sat: c.sat, start: t0, end: Date.parse(c.end), flashes: c.flashes.map(([la, lo, s]) => [la, lo, t0 + s * 1000]) });
  };

  async function refresh(signal) {
    if (!chunks.size) {
      const res = await fetch(`${GLM_BASE}/window.json`, { signal });
      if (!res.ok) throw new Error(`Lightning service returned ${res.status}.`);
      const win = await res.json();
      win.chunks.forEach(add);
      return summary(win.generated);
    }
    const res = await fetch(`${GLM_BASE}/index.json`, { signal });
    if (!res.ok) throw new Error(`Lightning service returned ${res.status}.`);
    const index = await res.json();
    const missing = index.chunks.filter((c) => !chunks.has(c.path));
    const loaded = await Promise.all(
      missing.map(async (c) => {
        const r = await fetch(`${GLM_BASE}/${c.path}`, { signal });
        return r.ok ? r.json() : null;
      })
    );
    loaded.filter(Boolean).forEach(add);
    const keep = new Set(index.chunks.map((c) => c.path));
    for (const p of chunks.keys()) if (!keep.has(p)) chunks.delete(p);
    return summary(index.generated);
  }

  function summary(generated) {
    const flashes = [];
    let newestEnd = 0;
    let newestFlash = 0;
    const sats = new Set();
    for (const c of chunks.values()) {
      newestEnd = Math.max(newestEnd, c.end);
      sats.add(c.sat);
      for (const f of c.flashes) {
        flashes.push(f);
        if (f[2] > newestFlash) newestFlash = f[2];
      }
    }
    flashes.sort((a, b) => a[2] - b[2]); // oldest first, so newest draw on top
    return {
      flashes,
      newestEnd: newestEnd ? new Date(newestEnd) : null,
      newestFlash: newestFlash ? new Date(newestFlash) : null,
      satellites: [...sats].sort().reverse(),
      generated: generated ? new Date(generated) : null,
    };
  }

  return { refresh };
}

// Age classes for fading (minutes): newest brightest.
export const GLM_AGES = [
  { maxMin: 1, color: '#ffffff', alpha: 1, label: '<1 min' },
  { maxMin: 5, color: '#ffd400', alpha: 0.95, label: '1-5' },
  { maxMin: 10, color: '#ff8a00', alpha: 0.8, label: '5-10' },
  { maxMin: 15, color: '#e0442b', alpha: 0.6, label: '10-15' },
];
