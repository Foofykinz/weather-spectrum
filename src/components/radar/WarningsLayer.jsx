import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { subscribeWarnings, WARNINGS_ATTRIBUTION } from '../../radar/providers/warnings';

// Draws NWS warning polygons and watch areas. Warnings: outline in the NWS
// color with a dark casing; tornado / flash flood emergencies and
// "particularly dangerous" / destructive-tagged warnings get a heavier line
// and a tinted fill. Watches: county / marine zone outlines with a faint fill,
// drawn underneath. Shapes aren't clickable; a map click lists what's there.
//
// frame: undefined = live (NWS, refreshed each minute); { loading: true } =
// a loop frame still loading (draw nothing rather than the wrong time);
// otherwise the state for the loop frame on screen.
export default function WarningsLayer({ frame, onStatus }) {
  const map = useMap();
  const statusCb = useRef(onStatus);
  statusCb.current = onStatus;
  const draw = useRef(null);
  const live = useRef(null);
  const frameRef = useRef(frame);
  frameRef.current = frame;

  if (!map.getPane('warnings')) {
    const pane = map.createPane('warnings');
    pane.style.zIndex = '440'; // above radar (350) and lightning (420), below labels (450)
    pane.style.pointerEvents = 'none';
  }

  useEffect(() => {
    const renderer = L.svg({ pane: 'warnings', padding: 0.5 });
    const group = L.layerGroup().addTo(map);
    map.attributionControl?.addAttribution(WARNINGS_ATTRIBUTION);

    draw.current = (s) => {
      map._wsWarnings = s;
      group.clearLayers();
      const base = { renderer, interactive: false, lineJoin: 'round' };
      if (s.shapes) {
        for (const w of s.watches || []) {
          for (const ugc of w.ugcs) {
            const rings = s.shapes.get(ugc);
            if (!rings) continue;
            L.polygon(rings, { ...base, color: w.type.color, weight: 1.5, opacity: 0.9, fillColor: w.type.color, fillOpacity: 0.07 }).addTo(group);
          }
        }
      }
      for (const w of s.warnings || []) {
        const heavy = w.danger === 'emergency' ? 1 : w.danger === 'high' ? 0.5 : 0;
        L.geoJSON(w.geometry, { style: { ...base, fill: false, color: '#000', weight: 5 + heavy * 3, opacity: 0.75 } }).addTo(group);
        L.geoJSON(w.geometry, {
          style: {
            ...base,
            color: w.type.color,
            weight: 2.5 + heavy * 2.5,
            opacity: 1,
            fill: heavy > 0,
            fillColor: w.type.color,
            fillOpacity: heavy ? 0.12 + heavy * 0.13 : 0,
          },
        }).addTo(group);
      }
      statusCb.current?.(s);
    };

    return () => {
      draw.current = null;
      group.remove();
      renderer.remove();
      delete map._wsWarnings;
      map.attributionControl?.removeAttribution(WARNINGS_ATTRIBUTION);
    };
  }, [map]);

  // Live subscription stays on while the layer is shown, so returning from a
  // loop is instant.
  useEffect(
    () =>
      subscribeWarnings((s) => {
        live.current = s;
        if (frameRef.current === undefined) draw.current?.(s);
      }),
    []
  );

  useEffect(() => {
    if (frame === undefined) {
      if (live.current) draw.current?.(live.current);
    } else if (frame.loading) {
      draw.current?.({ warnings: [], watches: [], shapes: null, loading: true, at: frame.at });
    } else {
      draw.current?.(frame);
    }
  }, [frame]);

  return null;
}
