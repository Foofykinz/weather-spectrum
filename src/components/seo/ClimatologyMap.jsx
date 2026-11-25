import React, { useEffect, useRef, useState } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import { maplibregl, climStyle, setAreas, cameraFor, VIEW } from '../../climatology/mapStyle';

// Map for /tornado-season: one month's "typical" (75% of activity) and
// "greater" (35%) areas. Drawn with MapLibre on a globe, tilted, so the
// country is seen at an angle with the Earth's curve, instead of the flat
// Leaflet map used elsewhere, framed on each month's area. The areas sit under
// the state lines and names (see climatology/mapStyle).
// month: { typical, greater, labels }. colors: { typical, greater }.

export default function ClimatologyMap({ month, colors }) {
  const box = useRef(null);
  const mapRef = useRef(null);
  const markers = useRef([]);
  const [ready, setReady] = useState(false);
  const first = useRef(true);

  useEffect(() => {
    let map;
    let alive = true;
    climStyle()
      .then((style) => {
        if (!alive) return;
        map = new maplibregl.Map({ container: box.current, style, ...VIEW, minZoom: 2, maxZoom: 8, scrollZoom: false, attributionControl: { compact: true } });
        map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
        map.on('load', () => {
          box.current?.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
          if (alive) setReady(true);
        });
        mapRef.current = map;
      })
      .catch(() => {
        // the page shows the month's numbers either way
      });
    return () => {
      alive = false;
      markers.current.forEach((m) => m.remove());
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    setAreas(map, month, colors);
    const small = (box.current?.clientWidth || 800) < 640;
    const cam = cameraFor(map, month, small ? { top: 90, bottom: 20, left: 10, right: 10 } : { top: 70, bottom: 30, left: 60, right: 60 }, small ? 0.55 : 0.2);
    if (cam) map.easeTo({ ...cam, duration: first.current ? 0 : 900 });
    first.current = false;
    markers.current.forEach((m) => m.remove());
    markers.current = [];
    for (const [key, text] of [['typical', 'Typical'], ['greater', 'Greater']]) {
      const at = month?.labels?.[key];
      if (!at) continue;
      const el = document.createElement('span');
      el.className = 'ws-clim-label';
      el.style.background = colors[key];
      el.textContent = text;
      markers.current.push(new maplibregl.Marker({ element: el, pitchAlignment: 'viewport', rotationAlignment: 'viewport' }).setLngLat([at[1], at[0]]).addTo(map));
    }
  }, [ready, month, colors]);

  return <div ref={box} className="h-full w-full" />;
}
