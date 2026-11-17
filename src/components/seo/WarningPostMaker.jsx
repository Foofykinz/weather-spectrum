import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Copy, Share2, X } from 'lucide-react';
import { SIZES, VERTICAL, FONTS, loadFont } from '../../radar/post';
import { snapshotMap } from '../../radar/snapshot';
import { STYLES, mapArea, coveredEdges, drawPost, buildCaptions, defaultHeadline, defaultSubline } from '../../warnings/post';
import { boundsFor, periodToParams } from '../../warnings/history';
import TornadoWarningMap from './TornadoWarningMap';

// Post image + captions for the tornado warnings of a period.
// info: { period, now, state, count, stats, officeName }; warnings: the list
// on the page; pageBounds: the page map's current area; theme: page map theme.
const ALL_SIZES = [...SIZES, { ...VERTICAL, label: 'Story' }];

// Draws the warnings on a map of exactly the post's map size, off screen, and
// copies it once the basemap has finished drawing.
function useMapPicture(warnings, theme, bounds, size, styleId, edges) {
  const area = mapArea(size, styleId);
  const SCALE = 1.6; // map detail: labels at 1.6x
  const css = { w: Math.round(area.w / SCALE), h: Math.round(area.h / SCALE) };
  const mapRef = useRef(null);
  const [pic, setPic] = useState({ status: 'working', img: null });
  // In map pixels: keep warnings clear of the boxes, and put them at the top
  // of the map (the spare space goes to the bottom, under the boxes).
  const fTop = edges ? Math.round(edges.top / SCALE) : -1;
  const fBottom = edges ? Math.round(edges.bottom / SCALE) : -1;
  const frame = useMemo(() => (fTop < 0 ? null : { top: fTop, bottom: fBottom }), [fTop, fBottom]);
  const key = `${theme}|${bounds.flat().join(',')}|${css.w}x${css.h}|${frame ? `${frame.top},${frame.bottom}` : 'view'}`;
  useEffect(() => {
    let alive = true;
    setPic((p) => ({ status: 'working', img: p.img }));
    (async () => {
      const t0 = Date.now();
      const ready = () => {
        const map = mapRef.current;
        const layers = map?._wsBasemaps;
        if (!layers?.length) return false;
        return layers.every((l) => {
          const m = l.getMaplibreMap?.();
          return m && m.loaded() && m.areTilesLoaded();
        });
      };
      while (alive && !ready() && Date.now() - t0 < 15000) await new Promise((r) => setTimeout(r, 250));
      await new Promise((r) => setTimeout(r, 400));
      if (!alive || !mapRef.current) return;
      const snap = await snapshotMap(mapRef.current, SCALE);
      if (alive) setPic({ status: 'ok', img: snap.canvas, basemap: ready() });
    })();
    return () => {
      alive = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const offscreen = (
    <div key={key} aria-hidden style={{ position: 'fixed', left: -10000, top: 0, width: css.w, height: css.h, pointerEvents: 'none' }}>
      <TornadoWarningMap warnings={warnings} theme={theme} bounds={bounds} frame={frame} mapRef={mapRef} still />
    </div>
  );
  return [pic, offscreen];
}

export default function WarningPostMaker({ info, warnings, pageBounds, theme: pageTheme, onClose }) {
  const [sizeId, setSizeId] = useState('square');
  const [styleId, setStyleId] = useState('spectrum');
  const [fontId, setFontId] = useState('system');
  const [fontState, setFontState] = useState({});
  const [theme, setTheme] = useState(pageTheme);
  const [areaMode, setAreaMode] = useState('fit');
  const [showStats, setShowStats] = useState(true);
  const [showChart, setShowChart] = useState(true);
  const [link, setLink] = useState(true);
  const [captionId, setCaptionId] = useState('numbers');
  const [edits, setEdits] = useState({});
  const [headline, setHeadline] = useState(null);
  const [subline, setSubline] = useState(null);
  const [message, setMessage] = useState(null);
  const [format, setFormat] = useState('png'); // 'png' | 'jpeg'
  const mime = `image/${format}`;
  const preview = useRef(null);

  const size = ALL_SIZES.find((s) => s.id === sizeId);
  const style = STYLES.find((s) => s.id === styleId);
  const font = FONTS.find((f) => f.id === fontId);
  const fitBounds = useMemo(() => boundsFor(warnings), [warnings]);
  const bounds = areaMode === 'page' && pageBounds ? pageBounds : fitBounds;
  const edges = areaMode === 'fit' ? coveredEdges(info, size, styleId, { stats: showStats, chart: showChart }) : null;
  const [pic, offscreen] = useMapPicture(warnings, theme, bounds, size, styleId, edges);
  const head = headline ?? defaultHeadline(info);
  const sub = subline ?? defaultSubline(info);
  const fontReady = !font.css || fontState[font.id] === 'ok' || fontState[font.id] === 'failed';

  const shareUrl = useMemo(() => {
    const q = new URLSearchParams({ ...periodToParams(info.period), ...(info.state ? { state: info.state } : {}) });
    return `https://theweatherspectrum.com/tornado-warnings?${q}`;
  }, [info.period, info.state]);
  const captions = useMemo(() => buildCaptions(info, { link: link ? shareUrl : null }), [info, link, shareUrl]);
  const caption = captions.find((c) => c.id === captionId) || captions[0];
  const captionText = edits[caption.id] ?? caption.text;

  useEffect(() => {
    if (!preview.current || !fontReady) return;
    drawPost(preview.current, pic.img, info, {
      size,
      style,
      font: fontState[font.id] === 'failed' ? FONTS[0] : font,
      headline: head,
      subline: sub,
      stats: showStats,
      chart: showChart,
    });
  }, [pic, info, size, style, font, fontState, fontReady, head, sub, showStats, showChart]);

  const pickFont = async (f) => {
    setFontId(f.id);
    if (!f.css || fontState[f.id]) return;
    setFontState((s) => ({ ...s, [f.id]: 'loading' }));
    const ok = await loadFont(f);
    setFontState((s) => ({ ...s, [f.id]: ok ? 'ok' : 'failed' }));
  };

  const fileName = () => {
    const p = periodToParams(info.period);
    return `tornado-warnings-${Object.values(p)[0]}${info.state ? `-${info.state.toLowerCase()}` : ''}.${format === 'jpeg' ? 'jpg' : 'png'}`;
  };
  const toBlob = () =>
    new Promise((resolve, reject) => preview.current.toBlob((b) => (b ? resolve(b) : reject(new Error('no image'))), mime, 0.92));
  const copyCaption = async (quiet) => {
    try {
      await navigator.clipboard.writeText(captionText);
      if (!quiet) setMessage('Caption copied.');
      return true;
    } catch {
      if (!quiet) setMessage("Couldn't copy automatically. Select the caption text and copy it.");
      return false;
    }
  };
  const download = async () => {
    try {
      const url = URL.createObjectURL(await toBlob());
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName();
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('Image saved.');
    } catch {
      setMessage("The image couldn't be made in this browser.");
    }
  };
  const canShare =
    typeof navigator !== 'undefined' && !!navigator.canShare && navigator.canShare({ files: [new File([''], 'a.png', { type: 'image/png' })] });
  const share = async () => {
    let blob;
    try {
      blob = await toBlob();
    } catch {
      return setMessage("The image couldn't be made in this browser.");
    }
    const copied = await copyCaption(true);
    try {
      await navigator.share({ files: [new File([blob], fileName(), { type: mime })], text: captionText });
      setMessage(copied ? 'Caption copied too: paste it into the post.' : null);
    } catch (err) {
      if (err.name !== 'AbortError') setMessage("Sharing didn't work here. Use Save image instead.");
    }
    return undefined;
  };

  const chip = (on) =>
    `rounded-md border px-2.5 py-1.5 text-xs font-semibold ${
      on ? 'border-amber-500/70 bg-amber-500/15 text-amber-200' : 'border-slate-700/80 text-slate-300 hover:bg-slate-800'
    }`;
  const label = 'block text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5';
  const input = 'w-full rounded-md border border-slate-700/80 bg-slate-950 px-2.5 py-1.5 text-sm text-slate-100';
  const choices = (list, value, set) => (
    <div className="flex flex-wrap gap-1.5">
      {list.map(([id, text, note]) => (
        <button key={id} type="button" className={chip(id === value)} onClick={() => set(id)} title={note}>
          {text}
        </button>
      ))}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[2000] flex items-start justify-center overflow-y-auto bg-black/70 p-2 sm:p-6" onClick={onClose}>
      {offscreen}
      <div
        role="dialog"
        aria-label="Make a post"
        className="w-full max-w-5xl rounded-xl border border-slate-700/80 bg-slate-900 text-slate-200 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <h2 className="text-sm font-semibold">Make a post</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-slate-400 hover:text-slate-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0">
            <div className="relative">
              <canvas ref={preview} className="mx-auto block h-auto max-h-[65vh] w-auto max-w-full rounded-md border border-slate-800" />
              {pic.status === 'working' && (
                <div className="absolute inset-x-0 top-3 mx-auto w-fit rounded-md bg-slate-950/90 px-3 py-1.5 text-xs text-slate-200">Drawing the map…</div>
              )}
            </div>
            {pic.status === 'ok' && !pic.basemap && <p className="mt-2 text-xs text-amber-300">The background map didn&apos;t finish loading; the warnings are still drawn.</p>}
            {!fontReady && <p className="mt-2 text-xs text-slate-400">Loading font…</p>}
            {fontState[font.id] === 'failed' && <p className="mt-2 text-xs text-amber-300">That font couldn&apos;t load, so a standard font is used.</p>}
          </div>

          <div className="space-y-4">
            <div>
              <span className={label}>Size</span>
              {choices(ALL_SIZES.map((s) => [s.id, s.label, s.note]), sizeId, setSizeId)}
            </div>
            <div>
              <span className={label}>Style</span>
              {choices(STYLES.map((s) => [s.id, s.label, s.note]), styleId, setStyleId)}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className={label}>Map</span>
                {choices([['dark', 'Dark'], ['light', 'Light']], theme, setTheme)}
              </div>
              <div>
                <span className={label}>Area</span>
                {choices([['fit', 'Fit warnings'], ...(pageBounds ? [['page', 'My view', 'The area shown on the page map']] : [])], areaMode, setAreaMode)}
              </div>
            </div>
            <div className={styleId === 'map' ? 'hidden' : ''}>
              <span className={label}>Font</span>
              <div className="flex flex-wrap gap-1.5">
                {FONTS.map((f) => (
                  <button key={f.id} type="button" className={chip(f.id === fontId)} onClick={() => pickFont(f)} style={fontState[f.id] === 'ok' ? { fontFamily: f.head } : undefined}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            <div className={`space-y-2 ${styleId === 'map' ? 'hidden' : ''}`}>
              <label className="block">
                <span className={label}>Headline</span>
                <input className={input} value={head} maxLength={60} onChange={(e) => setHeadline(e.target.value)} />
              </label>
              <label className="block">
                <span className={label}>Second line</span>
                <input className={input} value={sub} maxLength={80} onChange={(e) => setSubline(e.target.value)} />
              </label>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={showStats} onChange={(e) => setShowStats(e.target.checked)} /> Count and stats
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={showChart} onChange={(e) => setShowChart(e.target.checked)} /> Chart
                </label>
              </div>
            </div>
            <div>
              <span className={label}>Caption</span>
              <div className="mb-2">{choices(captions.map((c) => [c.id, c.label]), caption.id, setCaptionId)}</div>
              <textarea
                className={`${input} h-36 resize-y text-xs leading-relaxed`}
                value={captionText}
                onChange={(e) => setEdits((s) => ({ ...s, [caption.id]: e.target.value }))}
                aria-label="Caption text"
              />
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={link} onChange={(e) => setLink(e.target.checked)} /> Page link
                </label>
                {edits[caption.id] != null && (
                  <button type="button" className="ml-auto text-amber-300 hover:text-amber-200" onClick={() => setEdits((s) => ({ ...s, [caption.id]: undefined }))}>
                    Undo my edits
                  </button>
                )}
              </div>
            </div>
            <div>
              <span className={label}>File type</span>
              {choices([['png', 'PNG', 'Sharpest'], ['jpeg', 'JPEG', 'Smaller file']], format, setFormat)}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={download} disabled={pic.status !== 'ok'} className={`${chip(true)} flex items-center gap-1.5 disabled:opacity-50`}>
                <Download className="w-4 h-4" /> Save image
              </button>
              <button type="button" onClick={() => copyCaption(false)} className={`${chip(false)} flex items-center gap-1.5`}>
                <Copy className="w-4 h-4" /> Copy caption
              </button>
              {canShare && (
                <button type="button" onClick={share} disabled={pic.status !== 'ok'} className={`${chip(false)} flex items-center gap-1.5 disabled:opacity-50`}>
                  <Share2 className="w-4 h-4" /> Share
                </button>
              )}
            </div>
            {message && <p className="text-xs text-emerald-300">{message}</p>}
            <p className="text-[11px] leading-snug text-slate-400">
              Facebook doesn&apos;t accept caption text from other apps, so add the image to your post and paste the caption. The numbers are the warnings
              listed on this page{info.state ? ' for the state picked' : ''}.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
