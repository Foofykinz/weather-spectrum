// NOAA/NWS radar map service (the one behind radar.weather.gov).
//
// Serves single-radar NEXRAD Level III imagery as WMS (a standard map-image
// protocol Leaflet supports). Images arrive pre-colored by NWS, so legends
// must use NWS's official color tables — see ../legends.js.
//
// One small "capabilities" file per radar (~2 KB compressed) lists every
// product layer and its recent scan times, so we read the newest scan time
// from there and pin the imagery to it.

const NWS = 'https://opengeo.ncep.noaa.gov/geoserver';

export const NWS_ATTRIBUTION =
  'Radar: <a href="https://radar.weather.gov/" target="_blank" rel="noopener noreferrer">NOAA/NWS</a>';

// NWS uses lowercase 4-letter call signs as workspace names (ktlx, pahg, tjua).
const workspace = (icao) => icao.toLowerCase();

// Short-lived cache so switching between products at the same radar
// (velocity <-> hydrometeor class) doesn't refetch the same file.
const cache = new Map(); // icao -> { at, promise }
const CACHE_MS = 20000;

// Not cancellable on purpose: the request is shared between callers through
// the cache, so one caller giving up must not break the others. It's ~2 KB.
function fetchCapabilities(icao) {
  const hit = cache.get(icao);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.promise;
  const url = `${NWS}/${workspace(icao)}/ows?service=WMS&version=1.3.0&request=GetCapabilities`;
  const promise = fetch(url).then(async (res) => {
    if (res.status === 404) {
      const err = new Error('This radar is not available from the NWS map service.');
      err.code = 'NO_DATA';
      throw err;
    }
    if (!res.ok) throw new Error(`NWS radar service returned ${res.status}.`);
    return res.text();
  });
  cache.set(icao, { at: Date.now(), promise });
  promise.catch(() => cache.delete(icao)); // never cache failures
  return promise;
}

// Newest scan time for one product layer at one radar.
export async function fetchNwsLatest(icao, layer) {
  const xml = await fetchCapabilities(icao);
  const name = `${workspace(icao)}_${layer}`;
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const layerEl = [...doc.getElementsByTagName('Layer')].find(
    (el) => el.getElementsByTagName('Name')[0]?.textContent === name
  );
  if (!layerEl) {
    const err = new Error('This product is not available for this radar.');
    err.code = 'NO_DATA';
    throw err;
  }
  const dim = [...layerEl.getElementsByTagName('Dimension')].find((d) => d.getAttribute('name') === 'time');
  const validTime = new Date(dim?.getAttribute('default') || '');
  if (Number.isNaN(validTime.getTime())) throw new Error('NWS radar service returned an unreadable timestamp.');
  return { validTime, details: {} };
}

// Map layer description for the renderer (see RadarMap). Pinned to the exact
// scan time so the picture always matches the timestamp we show.
export function nwsWmsLayer(icao, layer, validTime) {
  return {
    kind: 'wms',
    url: `${NWS}/${workspace(icao)}/ows`,
    params: {
      layers: `${workspace(icao)}_${layer}`,
      format: 'image/png',
      transparent: true,
      version: '1.3.0',
      time: validTime.toISOString(),
    },
  };
}
