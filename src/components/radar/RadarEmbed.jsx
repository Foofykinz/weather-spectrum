import React from 'react';
import RadarMap from './RadarMap';
import RadarLegend from './RadarLegend';
import { getProduct } from '../../radar/products';
import { getStation } from '../../radar/stations';
import { useRadarFrame, useNow, freshnessOf } from '../../radar/useRadarFrame';

// Live super-resolution reflectivity from one radar, embedded in a page.
// Loaded lazily, so pages that include it stay light until it is needed.
const product = getProduct('site-reflectivity');
const zulu = (d) => `${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}Z`;

export default function RadarEmbed({ stationId, center }) {
  const station = getStation(stationId);
  const frame = useRadarFrame(product, station);
  const now = useNow();
  const f = freshnessOf(product, frame.validTime, now);
  return (
    <div className="relative h-full w-full">
      <RadarMap
        product={product}
        layer={frame.status === 'ok' ? frame.layer : null}
        details={frame.status === 'ok' ? frame.details : null}
        opacity={0.85}
        initialView={center}
        showStations={false}
        station={station}
        onSelectStation={() => {}}
        onTileErrors={() => {}}
        onBasemapError={() => {}}
        embed
      />
      <div className="pointer-events-none absolute left-2 top-2 z-[1000] rounded-md border border-slate-700/80 bg-slate-900/90 px-2 py-1 text-[11px] text-slate-200 tabular-nums">
        {station.icao} reflectivity ·{' '}
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
      <div className="pointer-events-none absolute left-2 right-14 bottom-6 z-[1000] sm:right-auto sm:w-72">
        <RadarLegend product={product} frame={frame} compact />
      </div>
    </div>
  );
}
