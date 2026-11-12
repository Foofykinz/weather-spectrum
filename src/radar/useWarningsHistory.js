import { useEffect, useState } from 'react';
import { loadHistory } from './providers/warnings';

// Warnings and watches in effect at each loop frame's time.
// Returns a function: frame time (Date) -> state for WarningsLayer
// ({ loading: true } until that history has arrived), or undefined when not looping.
export function useWarningsHistory(times, enabled) {
  const [history, setHistory] = useState(null);
  const key = enabled && times?.length ? times.map((d) => d.getTime()).join(',') : '';
  useEffect(() => {
    setHistory(null);
    if (!key) return undefined;
    const c = new AbortController();
    loadHistory(times, c.signal)
      .then((h) => !c.signal.aborted && setHistory(h))
      .catch((err) => {
        if (err.name !== 'AbortError') setHistory(new Map(times.map((d) => [d.getTime(), { warnings: [], watches: [], shapes: null, error: err, at: d }])));
      });
    return () => c.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!key) return () => undefined;
  return (t) => (t ? history?.get(t.getTime()) || { loading: true, at: t } : undefined);
}
