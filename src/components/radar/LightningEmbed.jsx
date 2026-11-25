import React, { useState } from 'react';
import RadarMap from './RadarMap';
import GlmStatus from './GlmStatus';
import { getProduct } from '../../radar/products';
import { useRadarFrame, useNow, freshnessOf } from '../../radar/useRadarFrame';

// Live national radar with GOES lightning, embedded in a page.
// Loaded lazily, so the page stays light until it is needed.
const product = getProduct('mosaic-reflectivity');
const zulu = (d) => `${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}Z`;

export default function LightningEmbed({ center }) {
  const frame = useRadarFrame(product, null);
  const now = useNow();
  const f = freshnessOf(product, frame.validTime, now);
  const [status, setStatus] = useState(null);
  return (
    <div className="relative h-full w-full">
      <RadarMap
        product={product}
        layer={frame.status === 'ok' ? frame.layer : null}
        details={frame.status === 'ok' ? frame.details : null}
        opacity={0.8}
        initialView={center}
        showStations={false}
        station={null}
        onSelectStation={() => {}}
        onTileErrors={() => {}}
        onBasemapError={() => {}}
        lightning
        onLightningStatus={setStatus}
        embed
      />
      <div className="pointer-events-none absolute left-2 top-2 z-[1000] rounded-md border border-slate-700/80 bg-slate-900/90 px-2 py-1 text-[11px] text-slate-200 tabular-nums">
        Radar ·{' '}
        {frame.status === 'ok' ? (
          <>
            {zulu(frame.validTime)} <span className="text-slate-400">({Math.max(0, Math.floor(f.ageMin))} min ago)</span>
          </>
        ) : frame.status === 'error' ? (
          <span className="text-red-300">unavailable</span>
        ) : (
          'loading'
        )}
      </div>
      <div className="absolute left-2 right-14 bottom-6 z-[1000] sm:right-auto sm:w-80">
        <GlmStatus status={status} now={now} compact />
      </div>
    </div>
  );
}
