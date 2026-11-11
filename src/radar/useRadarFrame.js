import { useEffect, useRef, useState } from 'react';

// Keeps track of the newest scan for one product (and station, if needed).
//
// How it stays cheap on mobile data:
//  - It only downloads a tiny timestamp file on a timer, never imagery.
//  - Map tiles are requested only when that timestamp actually changes.
//  - It pauses while the browser tab is hidden and checks again on return.
//
// Returns { status, validTime, layer, details, error, checkedAt }
//   status: 'loading' | 'ok' | 'error' | 'needs-station'
//   layer:  map layer description from the product (see products.js)

export function useRadarFrame(product, site) {
  const [frame, setFrame] = useState({ status: 'loading' });
  const lastValid = useRef(null);
  const siteId = site?.id;
  // Which product + station a result belongs to. Results for anything else
  // (e.g. in the instant after switching products) are never shown.
  const key = `${product.id}:${siteId || ''}`;
  const needsStation = product.scope === 'site' && !site;

  useEffect(() => {
    if (needsStation) {
      setFrame({ status: 'needs-station', key });
      return undefined;
    }

    let cancelled = false;
    let timer = null;
    let controller = null;
    lastValid.current = null;
    setFrame({ status: 'loading', key });

    const check = async () => {
      clearTimeout(timer);
      controller?.abort();
      controller = new AbortController();
      try {
        const { validTime, details } = await product.latest(site, controller.signal);
        if (cancelled) return;
        const changed = lastValid.current !== validTime.getTime();
        lastValid.current = validTime.getTime();
        setFrame((prev) => ({
          key,
          status: 'ok',
          validTime,
          details,
          // Keep the same layer object if nothing changed, so the map doesn't redraw.
          layer: changed || !prev.layer ? product.layer(site, validTime, details) : prev.layer,
          checkedAt: new Date(),
          error: null,
        }));
      } catch (err) {
        // Aborted = a newer check replaced this one; that check schedules the next.
        if (cancelled || err.name === 'AbortError') return;
        // Keep showing the last good image (if any), but say clearly that updating failed.
        setFrame((prev) => ({ ...prev, status: prev.layer ? 'ok' : 'error', error: err, checkedAt: new Date() }));
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
  }, [product, siteId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (frame.key !== key) return { status: needsStation ? 'needs-station' : 'loading', key };
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
