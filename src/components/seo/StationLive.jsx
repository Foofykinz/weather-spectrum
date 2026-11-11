import React, { useEffect, useState } from 'react';
import { fetchIemLatest } from '../../radar/providers/iem';
import { listLevel3Tilts } from '../../radar/providers/level3';
import { LEVEL3_TILTS } from '../../radar/products';
import { radarMode } from '../../radar/legends';

const zulu = (d) => `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`;

// Live operational status for one radar, fetched in the browser:
// latest scan time and scan strategy (VCP), and which elevation tilts are
// being published right now for reflectivity, velocity and dual-pol products.
export default function StationLive({ station, showTilts = true }) {
  const [scan, setScan] = useState(null); // { validTime, vcp } | { error }
  const [tilts, setTilts] = useState(null); // { B: [...], G: [...], C: [...] }
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const c = new AbortController();
    fetchIemLatest(station.id, 'N0B', c.signal)
      .then(({ validTime, details }) => setScan({ validTime, vcp: details.vcp }))
      .catch((err) => err.name !== 'AbortError' && setScan({ error: err }));
    if (showTilts) {
      Promise.all(['B', 'G', 'C'].map((l) => listLevel3Tilts(station, l, LEVEL3_TILTS, c.signal).catch(() => [])))
        .then(([B, G, C]) => setTilts({ B, G, C }))
        .catch(() => {});
    }
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => {
      c.abort();
      clearInterval(id);
    };
  }, [station.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const age = scan?.validTime ? Math.round((now - scan.validTime.getTime()) / 60000) : null;
  const mode = scan?.vcp != null ? radarMode(scan.vcp) : null;
  const list = (arr) => (arr && arr.length ? arr.map((t) => `${t.elevation.toFixed(1)}°`).join(', ') : 'none published right now');

  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 text-sm">
      <div>
        <dt className="text-slate-400">Latest scan</dt>
        <dd className="mt-0.5 text-slate-100 tabular-nums">
          {!scan && 'Checking…'}
          {scan?.error && <span className="text-amber-300">No recent data (the radar may be offline)</span>}
          {scan?.validTime && (
            <>
              {zulu(scan.validTime)}{' '}
              <span className={age > 20 ? 'text-red-300' : age > 12 ? 'text-amber-300' : 'text-slate-400'}>({age} min ago)</span>
            </>
          )}
        </dd>
      </div>
      <div>
        <dt className="text-slate-400">Scan strategy</dt>
        <dd className="mt-0.5 text-slate-100">
          {scan?.vcp != null ? `VCP ${scan.vcp}, ${mode === 'clear' ? 'clear-air mode' : 'precipitation mode'}` : scan ? 'Not reported' : 'Checking…'}
        </dd>
      </div>
      {showTilts && (
        <>
          <div>
            <dt className="text-slate-400">Reflectivity tilts now</dt>
            <dd className="mt-0.5 text-slate-100 tabular-nums">{tilts ? list(tilts.B) : 'Checking…'}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Velocity tilts now</dt>
            <dd className="mt-0.5 text-slate-100 tabular-nums">{tilts ? list(tilts.G) : 'Checking…'}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Dual-pol tilts now</dt>
            <dd className="mt-0.5 text-slate-100 tabular-nums">{tilts ? list(tilts.C) : 'Checking…'}</dd>
          </div>
        </>
      )}
    </dl>
  );
}
