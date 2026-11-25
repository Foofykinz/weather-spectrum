import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import {
  subscribeStorms,
  stormsAt,
  stormsReady,
  radarStormHistory,
  stormsFromHistory,
  selectStorms,
  compassOf,
  aheadOf,
  STORMS_ATTRIBUTION,
  MESO_MIN_RANK,
  HAIL_MIN_IN,
} from '../../radar/providers/storms';

// Storm markers from the NWS radar algorithms. One small marker per storm,
// showing its most serious detection:
//   red triangle   tornado vortex signature (TVS)
//   yellow ring    mesocyclone
//   green diamond  estimated hail 0.75" or larger
// plus a thin line for where it's heading in the next 30 minutes.
// Tap a marker for the details.
// time: undefined = live; a Date = the storms at that loop / past frame.
// times: every frame time of the loop, loaded up front so markers keep pace.
// radar: show only this radar's detections (single-radar view), or null.

const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const SHAPES = {
  tvs: '<path d="M2 3 H16 L9 15 Z" fill="#ef4444" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>',
  meso: '<circle cx="9" cy="9" r="6" fill="none" stroke="#111" stroke-width="4"/><circle cx="9" cy="9" r="6" fill="none" stroke="#facc15" stroke-width="2.2"/>',
  hail: '<path d="M9 2 L16 9 L9 16 L2 9 Z" fill="#22c55e" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>',
};
const kindOf = (s) => (s.tvs ? 'tvs' : (s.meso ?? 0) >= MESO_MIN_RANK ? 'meso' : s.hail >= HAIL_MIN_IN ? 'hail' : null);
const icons = Object.fromEntries(
  Object.entries(SHAPES).map(([k, svg]) => [
    k,
    L.divIcon({ className: 'ws-storm-icon', html: `<svg width="18" height="18" viewBox="0 0 18 18">${svg}</svg>`, iconSize: [18, 18], iconAnchor: [9, 9] }),
  ])
);

function popupHtml(s) {
  const rows = [];
  if (s.tvs) rows.push(`<b style="color:#f87171">${s.tvs === 'TVS' ? 'Tornado vortex signature (TVS)' : 'Elevated TVS'}</b>`);
  if (s.meso != null) rows.push(`Mesocyclone: strength rank ${s.meso}`);
  if (s.hail) rows.push(`Max hail size estimate: ${s.hail.toFixed(2)} in`);
  if (s.posh || s.poh) rows.push(`Chance of hail: ${s.poh}% (severe hail: ${s.posh}%)`);
  if (s.mph) rows.push(`Moving ${compassOf(s.toward)} at ${s.mph} mph${s.mph >= 5 && kindOf(s) !== 'hail' ? ' (line: projected 30-minute path from that motion)' : ''}`);
  if (s.top) rows.push(`Storm top: ${Math.round(s.top)},000 ft &middot; Max ${s.maxDbz} dBZ`);
  const time = s.valid.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  return `<div style="font-size:12px;line-height:1.45">
    <div style="font-weight:600;margin-bottom:2px">Storm ${esc(s.id)} &middot; K${esc(s.radar)} at ${esc(time)}</div>
    ${rows.join('<br>')}
    <div style="margin-top:4px;color:#94a3b8;font-size:11px">Automated radar detection, not a warning or a report.</div>
  </div>`;
}

export default function StormsLayer({ time, times, radar, live = true }) {
  const map = useMap();
  const group = useRef(null);
  const liveData = useRef(null);
  const timeRef = useRef(time);
  timeRef.current = time;
  const radarRef = useRef(radar);
  radarRef.current = radar;

  if (!map.getPane('storms')) {
    const pane = map.createPane('storms');
    pane.style.zIndex = '460'; // above warnings and place names
  }

  const draw = (all) => {
    const g = group.current;
    if (!g) return;
    g.clearLayers();
    for (const s of selectStorms(all, radarRef.current)) {
      const kind = kindOf(s);
      if (!kind) continue;
      if (s.mph >= 5 && s.toward != null && kind !== 'hail') {
        L.polyline([[s.lat, s.lon], aheadOf(s, 30)], { pane: 'storms', color: '#fff', weight: 1.5, opacity: 0.75, interactive: false }).addTo(g);
      }
      L.marker([s.lat, s.lon], { pane: 'storms', icon: icons[kind], keyboard: false, zIndexOffset: kind === 'tvs' ? 1000 : kind === 'meso' ? 500 : 0 })
        .bindPopup(popupHtml(s), { className: 'ws-radar-popup', maxWidth: 260, autoPanPadding: [12, 64] })
        .addTo(g);
    }
  };

  useEffect(() => {
    group.current = L.layerGroup().addTo(map);
    map.attributionControl?.addAttribution(STORMS_ATTRIBUTION);
    const unsub = live
      ? subscribeStorms((d) => {
          liveData.current = d;
          if (timeRef.current === undefined) draw(d.storms);
        })
      : () => {};
    return () => {
      unsub();
      group.current?.remove();
      group.current = null;
      map.attributionControl?.removeAttribution(STORMS_ATTRIBUTION);
    };
  }, [map]); // eslint-disable-line react-hooks/exhaustive-deps

  // Loops on one radar: that radar's detections for the whole loop in one
  // small download. Otherwise (national map) a lookup per frame time.
  const timesKey = times?.map((t) => t.getTime()).join(',') || '';
  const history = useRef(null); // { key, data }
  useEffect(() => {
    if (!times?.length) return;
    if (radar) {
      const key = `${radar}|${timesKey}`;
      if (history.current?.key === key) return;
      const lo = new Date(Math.min(...times.map((t) => t.getTime())));
      const hi = new Date(Math.max(...times.map((t) => t.getTime())));
      radarStormHistory(radar, lo, hi)
        .then((data) => {
          history.current = { key, data };
          if (timeRef.current) draw(stormsFromHistory(data, timeRef.current));
        })
        .catch(() => {});
    } else times.forEach((t) => stormsAt(t).catch(() => {}));
  }, [timesKey, radar]); // eslint-disable-line react-hooks/exhaustive-deps

  const timeMs = time ? time.getTime() : null;
  useEffect(() => {
    if (timeMs == null) {
      draw(liveData.current?.storms);
      return undefined;
    }
    const t = new Date(timeMs);
    if (radar && history.current?.key === `${radar}|${timesKey}`) {
      draw(stormsFromHistory(history.current.data, t)); // same instant as the radar frame
      return undefined;
    }
    if (radar && times?.length) return undefined; // the radar's history is loading; drawn when it arrives
    const cached = stormsReady(t);
    if (cached) {
      draw(cached);
      return undefined;
    }
    let alive = true;
    stormsAt(t)
      .then((storms) => alive && draw(storms))
      .catch(() => alive && draw([]));
    return () => {
      alive = false;
    };
  }, [timeMs, radar]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
