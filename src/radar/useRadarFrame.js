import { useEffect, useRef, useState } from 'react';

// Keeps track of the newest scan for one product (and station, if needed).
//
// How it stays cheap on mobile data:
//  - It only downloads a tiny timestamp file on a timer, never imagery.
//  - Map tiles are requested only when that timestamp actually changes.
//  - It pauses while the browser tab is hidden and checks again on return.
//
// Returns { status, validTime, tileUrl, details, error, checkedAt }
//   status: 'loading' | 'ok' | 'error' | 'needs-station'

export function useRadarFrame(product, siteId) {
  const [frame, setFrame] = useState({ status: 'loading' });
  const lastValid = useRef(null);

  useEffect(() => {
    if (product.scope === 'site' && !siteId) {
      setFrame({ status: 'needs-station' });
      return undefined;
    }

    let cancelled = false;
    let timer = null;
    let controller = null;
    lastValid.current = null;
    setFrame({ status: 'loading' });

    const check = async () => {
      clearTimeout(timer);
      controller?.abort();
      controller = new AbortController();
      try {
        const { validTime, details } = await product.latest(siteId, controller.signal);
        if (cancelled) return;
        const changed = lastValid.current !== validTime.getTime();
        lastValid.current = validTime.getTime();
        setFrame((prev) => ({
          status: 'ok',
          validTime,
          details,
          // Keep the same URL string if nothing changed, so the map doesn't redraw.
          tileUrl: changed || !prev.tileUrl ? product.render.tileUrl(siteId, validTime) : prev.tileUrl,
          checkedAt: new Date(),
          error: null,
        }));
      } catch (err) {
        if (cancelled || err.name === 'AbortError') return;
        // Keep showing the last good image (if any), but say clearly that updating failed.
        setFrame((prev) => ({ ...prev, status: prev.tileUrl ? 'ok' : 'error', error: err, checkedAt: new Date() }));
      }
      if (!cancelled && !document.hidden) timer = setTimeout(check, product.pollSeconds * 1000);
    };

    const onVisibility = () => {
      if (document.hidden) clearTimeout(timer);
      else check();
    };

    check();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [product, siteId]);

  return frame;
}

// Classify how old a scan is, using the product's own thresholds.
export function freshnessOf(product, validTime, now = Date.now()) {
  if (!validTime) return { level: 'unknown', ageMin: null };
  const ageMin = (now - validTime.getTime()) / 60000;
  const { delayedAfterMin, staleAfterMin } = product.freshness;
  const level = ageMin >= staleAfterMin ? 'stale' : ageMin >= delayedAfterMin ? 'delayed' : 'live';
  return { level, ageMin };
}

// Re-render once in a while so "3 min ago" labels keep counting.
export function useNow(intervalMs = 15000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
