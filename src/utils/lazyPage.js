import { lazy } from 'react';

// Parts of the site that load on demand (the radar page, embedded maps) live
// in separate files whose names change with every deploy. A page opened
// before a deploy still asks for the old names, which no longer exist, so the
// download fails. When that happens, reload the page once to get the current
// version; if it fails again within a minute (a real connection problem), let
// the error through to PageErrorBoundary, which offers a reload button.
const KEY = 'ws.reloadedForUpdate';

export function loadFresh(load) {
  return load().catch((err) => {
    try {
      const last = Number(sessionStorage.getItem(KEY)) || 0;
      if (Date.now() - last > 60000) {
        sessionStorage.setItem(KEY, String(Date.now()));
        window.location.reload();
        return new Promise(() => {}); // keep the loading screen up until the reload
      }
    } catch {
      // storage blocked: don't risk a reload loop
    }
    throw err;
  });
}

export const lazyPage = (load) => lazy(() => loadFresh(load));
