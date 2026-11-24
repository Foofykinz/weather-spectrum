// Extra live layers for the radar tool, shared with the broadcast:
// - wind and winter alerts (NWS forecast-zone alerts), shaded under the radar
//   and listed in the tap popup;
// - current readings at airport weather stations (temperature or wind).
// Both are live only.

import { useEffect, useState } from 'react';
import { subscribeZoneAlerts, zoneLayer } from '../broadcast/zoneAlerts';
import { obsInBounds, tempLayer, windLayer } from '../broadcast/temps';

// Calls fn(map) once the map exists (it can mount a moment after the page).
function whenMap(mapRef, fn) {
  let t = 0;
  let tries = 0;
  let stop = false;
  const go = () => {
    if (stop) return;
    if (mapRef.current) fn(mapRef.current);
    else if (tries++ < 80) t = setTimeout(go, 250);
  };
  go();
  return () => {
    stop = true;
    clearTimeout(t);
  };
}

function pane(map, name, z, clickable) {
  if (!map.getPane(name)) Object.assign(map.createPane(name).style, { zIndex: z, pointerEvents: clickable ? '' : 'none' });
}

// Returns { count, error }.
export function useZoneAlertsLayer(mapRef, on) {
  const [state, setState] = useState(null);
  useEffect(() => (on ? subscribeZoneAlerts(setState) : setState(null)), [on]);
  const alerts = on ? state?.alerts || [] : [];
  const key = alerts.map((a) => `${a.id}:${a.shapes.length}`).join(',');
  useEffect(() => {
    let layer = null;
    let map = null;
    const stop = whenMap(mapRef, (m) => {
      map = m;
      map._wsZoneAlerts = alerts; // read by the tap popup
      if (!alerts.length) return;
      pane(map, 'zonealerts', 340, false); // under the radar
      layer = zoneLayer(alerts, 'zonealerts').addTo(map);
      map.attributionControl?.addAttribution('Wind and winter alerts: NWS; zone outlines via IEM');
    });
    return () => {
      stop();
      if (layer) layer.remove();
      if (map) map._wsZoneAlerts = [];
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return { count: alerts.length, error: on ? state?.error || null : null };
}

// mode: null | 'temps' | 'wind'. Redrawn after every pan / zoom.
// Returns { tooFar } (readings only show from zoom MIN_ZOOM in).
const MIN_ZOOM = 6;
export function useStationObsLayer(mapRef, mode) {
  const [tooFar, setTooFar] = useState(false);
  useEffect(() => {
    if (!mode) {
      setTooFar(false);
      return undefined;
    }
    let layer = null;
    let map = null;
    let seq = 0;
    let t = 0;
    const draw = async () => {
      const n = ++seq;
      const z = map.getZoom();
      if (z < MIN_ZOOM) {
        setTooFar(true);
        if (layer) layer.remove();
        layer = null;
        return;
      }
      setTooFar(false);
      const b = map.getBounds();
      const obs = await obsInBounds([[b.getSouth(), b.getWest()], [b.getNorth(), b.getEast()]], mode);
      if (n !== seq) return; // a newer pan/zoom took over
      if (layer) layer.remove();
      pane(map, 'stationobs', 460, false); // above place names
      layer = (mode === 'wind' ? windLayer : tempLayer)(map, obs, z, 44, { size: 0.62, pane: 'stationobs' }).addTo(map);
      map.attributionControl?.addAttribution(mode === 'wind' ? 'Wind: ASOS via IEM' : 'Temperatures: ASOS via IEM');
    };
    const later = () => {
      clearTimeout(t);
      t = setTimeout(draw, 300);
    };
    const stop = whenMap(mapRef, (m) => {
      map = m;
      map.on('moveend', later);
      draw();
    });
    // Readings update hourly-ish; refresh every 10 minutes (downloads are cached that long).
    const every = setInterval(() => map && draw(), 10 * 60e3);
    return () => {
      stop();
      seq++;
      clearTimeout(t);
      clearInterval(every);
      if (map) map.off('moveend', later);
      if (layer) layer.remove();
    };
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps
  return { tooFar };
}
