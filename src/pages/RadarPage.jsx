import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Layers, ArrowLeft } from 'lucide-react';
import RadarMap from '../components/radar/RadarMap';
import RadarLegend from '../components/radar/RadarLegend';
import RadarStatus from '../components/radar/RadarStatus';
import ProductPanel from '../components/radar/ProductPanel';
import { getProduct, DEFAULT_PRODUCT_ID } from '../radar/products';
import { getStation, nearestStation } from '../radar/stations';
import { useRadarFrame, useNow } from '../radar/useRadarFrame';

// Per-viewer conveniences only (last map view & opacity). Safe if storage is blocked.
const VIEW_KEY = 'ws.radar.view';
const OPACITY_KEY = 'ws.radar.opacity';
const DEFAULT_VIEW = { lat: 38.5, lon: -96.5, zoom: 4 };

function readStored(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
function writeStored(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable — ignore */
  }
}

export default function RadarPage() {
  // Product and station live in the URL, so a view can be bookmarked or shared:
  //   /radar?product=site-reflectivity&site=TLX
  const [params, setParams] = useSearchParams();
  const product = getProduct(params.get('product') || DEFAULT_PRODUCT_ID);
  const station = getStation((params.get('site') || '').toUpperCase());

  const [initialView] = useState(() => {
    const v = readStored(VIEW_KEY, DEFAULT_VIEW);
    return Number.isFinite(v?.lat) && Number.isFinite(v?.lon) && Number.isFinite(v?.zoom) ? v : DEFAULT_VIEW;
  });
  const viewRef = useRef(initialView);
  const [opacity, setOpacity] = useState(() => {
    const o = Number(readStored(OPACITY_KEY, 0.85));
    return o >= 0.1 && o <= 1 ? o : 0.85;
  });
  const [panelOpen, setPanelOpen] = useState(false);
  const [tileErrors, setTileErrors] = useState(0);
  const [basemapError, setBasemapError] = useState(null);

  const frame = useRadarFrame(product, product.scope === 'site' ? station : null);
  const now = useNow();

  const updateParams = useCallback(
    (changes) => {
      const next = new URLSearchParams(params);
      for (const [k, v] of Object.entries(changes)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      setParams(next, { replace: true });
    },
    [params, setParams]
  );

  const pickNearest = useCallback(() => {
    const v = viewRef.current;
    const s = nearestStation(v.lat, v.lon);
    if (s) updateParams({ site: s.id });
  }, [updateParams]);

  const selectProduct = (id) => {
    const p = getProduct(id);
    const changes = { product: id };
    // Single-site products need a radar: default to the one nearest the map center.
    if (p.scope === 'site' && !station) {
      const v = viewRef.current;
      changes.site = nearestStation(v.lat, v.lon)?.id;
    }
    updateParams(changes);
  };

  const selectStation = (id) => updateParams({ site: id });

  const onViewChange = useCallback((v) => {
    viewRef.current = v;
    writeStored(VIEW_KEY, v);
  }, []);

  useEffect(() => writeStored(OPACITY_KEY, opacity), [opacity]);

  // Full-screen page: stop the site behind it from scrolling, set the tab title.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevTitle = document.title;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
      document.title = prevTitle;
    };
  }, []);
  useEffect(() => {
    const label = product.scope === 'site' && station ? `${station.icao} ${product.short}` : product.short;
    document.title = `${label} — Radar | The Weather Spectrum`;
  }, [product, station]);

  return (
    <div className="fixed inset-0 z-[55] bg-[#0b0f17] text-slate-200">
      <RadarMap
        product={product}
        layer={frame.status === 'ok' ? frame.layer : null}
        opacity={opacity}
        initialView={initialView}
        onViewChange={onViewChange}
        showStations={product.scope === 'site'}
        station={station}
        onSelectStation={selectStation}
        onTileErrors={setTileErrors}
        onBasemapError={setBasemapError}
      />

      {/* Top-left: navigation, product button, status. pointer-events-none lets
          map drags pass through the empty space between controls. */}
      <div className="pointer-events-none absolute top-0 left-0 right-0 z-[1000] p-2 sm:p-3 flex flex-col gap-2 sm:max-w-sm">
        <div className="pointer-events-auto flex items-center gap-2">
          <Link
            to="/"
            className="flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-900/85 backdrop-blur px-2.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 shadow-lg"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Weather Spectrum</span>
          </Link>
          <button
            type="button"
            onClick={() => setPanelOpen((o) => !o)}
            aria-expanded={panelOpen}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold shadow-lg backdrop-blur ${
              panelOpen
                ? 'border-amber-500/70 bg-amber-500/15 text-amber-200'
                : 'border-slate-700/80 bg-slate-900/85 text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>{product.short}</span>
            {product.scope === 'site' && station && <span className="text-amber-300">{station.icao}</span>}
          </button>
        </div>

        <ProductPanel
          open={panelOpen}
          onClose={() => setPanelOpen(false)}
          productId={product.id}
          onSelectProduct={selectProduct}
          product={product}
          station={station}
          onSelectStation={selectStation}
          onNearestStation={pickNearest}
          opacity={opacity}
          onOpacity={setOpacity}
        />

        {!panelOpen && (
          <div className="pointer-events-auto">
            <RadarStatus product={product} station={station} frame={frame} now={now} tileErrors={tileErrors} />
            {basemapError && (
              <p className="mt-2 rounded-lg border border-amber-700/60 bg-slate-900/85 px-3 py-1.5 text-xs text-amber-300">
                Background map couldn&apos;t load. Radar data is still shown.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Bottom-left legend; leaves room for zoom buttons and attribution on the right. */}
      <div className="pointer-events-none absolute left-2 right-16 bottom-10 sm:left-3 sm:right-auto sm:bottom-7 sm:w-96 z-[1000]">
        <div className="pointer-events-auto">
          <RadarLegend product={product} frame={frame} />
        </div>
      </div>
    </div>
  );
}
