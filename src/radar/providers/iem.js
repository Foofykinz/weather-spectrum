// Iowa Environmental Mesonet (IEM), Iowa State University.
//
// IEM ingests the NWS NEXRAD Level III feed and serves it as ready-made,
// colored web-map tiles. That lets us show real radar without running our own
// processing servers yet.
//
// Data terms: IEM states its materials are public domain and may be used
// freely; attribution is requested; no warranty of accuracy is given.
// https://mesonet.agron.iastate.edu/disclaimer.php

const IEM = 'https://mesonet.agron.iastate.edu';

export const IEM_ATTRIBUTION =
  'Radar: NOAA/NWS NEXRAD via <a href="https://mesonet.agron.iastate.edu/" target="_blank" rel="noopener noreferrer">Iowa Environmental Mesonet</a>';

// "2026-11-11T10:15:14Z" -> "202611111015" (IEM tile timestamps are UTC, to the minute)
function toIemStamp(date) {
  const p = (n) => String(n).padStart(2, '0');
  return (
    date.getUTCFullYear() +
    p(date.getUTCMonth() + 1) +
    p(date.getUTCDate()) +
    p(date.getUTCHours()) +
    p(date.getUTCMinutes())
  );
}

// Tiles are pinned to a specific scan time rather than "latest". This
// guarantees the picture always matches the timestamp we display, lets the
// browser cache each scan, and is exactly what animation will need later.
// `site` is a 3-letter IEM id (e.g. "TLX"), or "USCOMP" for the national mosaic.
export function iemTileUrl(site, product, validTime) {
  return `${IEM}/cache/tile.py/1.0.0/ridge::${site}-${product}-${toIemStamp(validTime)}/{z}/{x}/{y}.png`;
}

// Ask IEM what the newest available scan is. These files are tiny (~150 bytes).
export async function fetchIemLatest(site, product, signal) {
  const url =
    site === 'USCOMP'
      ? `${IEM}/data/gis/images/4326/USCOMP/${product.toLowerCase()}_0.json`
      : `${IEM}/data/gis/images/4326/ridge/${site}/${product}_0.json`;

  // 'no-cache' = always check with the server, but allow a cheap "not modified" reply.
  const res = await fetch(url, { cache: 'no-cache', signal });
  if (res.status === 404) {
    const err = new Error('No recent data for this radar.');
    err.code = 'NO_DATA';
    throw err;
  }
  if (!res.ok) throw new Error(`Radar data service returned ${res.status}.`);

  const { meta } = await res.json();
  const validTime = new Date(meta?.valid);
  if (!meta?.valid || Number.isNaN(validTime.getTime())) {
    throw new Error('Radar data service returned an unreadable timestamp.');
  }

  const details = {};
  if (meta.vcp != null) details.vcp = meta.vcp;
  if (meta.radar_quorum) details.radarsReporting = meta.radar_quorum; // e.g. "144/147"
  return { validTime, details };
}
