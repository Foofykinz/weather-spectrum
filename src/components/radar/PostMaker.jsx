import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Copy, Share2, X } from 'lucide-react';
import { LEGENDS } from '../../radar/legends';
import {
  SIZES,
  STYLES,
  FONTS,
  loadFont,
  cropFor,
  alertsInView,
  buildCaptions,
  defaultHeadline,
  defaultSubline,
  drawPost,
  hashtag,
  pastArea,
  TIME_ZONES,
  zoneForStation,
  bannerText,
  bannerTime,
} from '../../radar/post';

// Make a Facebook-ready radar image of the current map view, with caption
// drafts built from the official warning data.
// snap: map snapshot; base: { product, station, time, past, frame, alerts }
export default function PostMaker({ snap, base, onClose }) {
  const [sizeId, setSizeId] = useState('square');
  const [styleId, setStyleId] = useState('spectrum');
  const [fontId, setFontId] = useState('system');
  const [fontState, setFontState] = useState({}); // id -> 'loading' | 'ok' | 'failed'
  const [showLegend, setShowLegend] = useState(true);
  const [showList, setShowList] = useState(true);
  const [link, setLink] = useState(true);
  const [tags, setTags] = useState(false);
  const [captionId, setCaptionId] = useState(null);
  const [edits, setEdits] = useState({});
  const [headline, setHeadline] = useState(null);
  const [subline, setSubline] = useState(null);
  const [legendImg, setLegendImg] = useState(null);
  const [message, setMessage] = useState(null);
  const preview = useRef(null);

  const size = SIZES.find((s) => s.id === sizeId);
  const style = STYLES.find((s) => s.id === styleId);
  const font = FONTS.find((f) => f.id === fontId);
  const crop = useMemo(() => cropFor(snap, size, styleId), [snap, size, styleId]);
  const inView = useMemo(() => alertsInView(base.alerts, snap, crop), [base.alerts, snap, crop]);
  const [areas, setAreas] = useState({}); // past warning id -> county list
  const [zone, setZone] = useState(() => zoneForStation(base.station));
  const [bannerOn, setBannerOn] = useState(true);
  const [banner, setBanner] = useState(null);
  const info = { ...base, ...inView, tz: zone, warnings: inView.warnings.map((w) => (w.area || !areas[w.id] ? w : { ...w, area: areas[w.id] })) };

  // Past warnings: look up county names for the warnings captions mention.
  const lookup = inView.warnings.slice(0, 3).filter((w) => !w.area && w.event && !(w.id in areas));
  useEffect(() => {
    if (!base.past || !lookup.length) return undefined;
    let live = true;
    Promise.all(lookup.map((w) => pastArea(w, base.time.getTime()).then((a) => [w.id, a]))).then((pairs) => {
      if (live) setAreas((s) => ({ ...s, ...Object.fromEntries(pairs) }));
    });
    return () => {
      live = false;
    };
  }, [lookup.map((w) => w.id).join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const captions = buildCaptions(info, { link, tags });
  const caption = captions.find((c) => c.id === captionId) || captions[0];
  const captionText = edits[caption.id] ?? caption.text;
  const head = headline ?? defaultHeadline(info);
  const sub = subline ?? defaultSubline(info);
  const top = info.warnings[0];
  const bannerValue = banner ?? bannerText(top);
  const bannerRight = banner == null ? bannerTime(top, zone) : '';

  useEffect(() => {
    const legend = LEGENDS[base.product.legend];
    if (legend?.type !== 'image') return;
    const img = new Image();
    img.onload = () => setLegendImg(img);
    img.src = legend.src;
  }, [base.product.legend]);

  const pickFont = (f) => {
    setFontId(f.id);
    if (!f.css || fontState[f.id] === 'ok') return;
    setFontState((s) => ({ ...s, [f.id]: 'loading' }));
    loadFont(f)
      .then((ok) => setFontState((s) => ({ ...s, [f.id]: ok ? 'ok' : 'failed' })))
      .catch(() => setFontState((s) => ({ ...s, [f.id]: 'failed' })));
  };

  const fontReady = !font.css || fontState[font.id] === 'ok' || fontState[font.id] === 'failed';
  useEffect(() => {
    if (!preview.current || !fontReady) return;
    drawPost(preview.current, snap, crop, info, { size, style, font, headline: head, subline: sub, legend: showLegend, list: showList, banner: bannerOn ? bannerValue.trim() : '', bannerRight }, legendImg);
  }); // redraw on every change; drawing takes a few milliseconds

  const fileName = () => {
    const t = base.time.toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
    return `radar-${base.station?.icao || 'national'}-${t}Z.png`;
  };
  const toBlob = () =>
    new Promise((res, rej) => {
      try {
        preview.current.toBlob((b) => (b ? res(b) : rej(new Error('empty'))), 'image/png');
      } catch (err) {
        rej(err);
      }
    });
  const blobError = (err) =>
    setMessage(
      err?.name === 'SecurityError'
        ? "This image can't be saved: one of the map sources doesn't allow its pictures to be copied."
        : "The image couldn't be created."
    );

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
      const blob = await toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName();
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('Image saved.');
    } catch (err) {
      blobError(err);
    }
  };

  const canShare = typeof navigator !== 'undefined' && !!navigator.canShare && navigator.canShare({ files: [new File([''], 'a.png', { type: 'image/png' })] });
  const share = async () => {
    let blob;
    try {
      blob = await toBlob();
    } catch (err) {
      return blobError(err);
    }
    const copied = await copyCaption(true);
    try {
      await navigator.share({ files: [new File([blob], fileName(), { type: 'image/png' })], text: captionText });
      setMessage(copied ? 'Caption copied too: paste it into the post.' : null);
    } catch (err) {
      if (err.name !== 'AbortError') setMessage("Sharing didn't work here. Use Save image instead.");
    }
  };

  const chip = (on) =>
    `rounded-md border px-2.5 py-1.5 text-xs font-semibold ${
      on ? 'border-amber-500/70 bg-amber-500/15 text-amber-200' : 'border-slate-700/80 text-slate-300 hover:bg-slate-800'
    }`;
  const label = 'block text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5';
  const input = 'w-full rounded-md border border-slate-700/80 bg-slate-950 px-2.5 py-1.5 text-sm text-slate-100';
  const tag = hashtag(info);

  return (
    <div className="fixed inset-0 z-[2000] flex items-start justify-center overflow-y-auto bg-black/70 p-2 sm:p-6" onClick={onClose}>
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
            <canvas ref={preview} className="mx-auto block h-auto max-h-[60vh] w-auto max-w-full rounded-md border border-slate-800" />
            {!fontReady && <p className="mt-2 text-xs text-slate-400">Loading font...</p>}
            {fontState[font.id] === 'failed' && <p className="mt-2 text-xs text-amber-300">That font couldn&apos;t load, so a standard font is used.</p>}
            <p className="mt-2 text-[11px] leading-snug text-slate-400">
              The picture is the map as it was when you opened this. To change the area, close this, move or zoom the map, and open it again.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <span className={label}>Size</span>
              <div className="flex flex-wrap gap-1.5">
                {SIZES.map((s) => (
                  <button key={s.id} type="button" className={chip(s.id === sizeId)} onClick={() => setSizeId(s.id)} title={s.note}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className={label}>Style</span>
              <div className="flex flex-wrap gap-1.5">
                {STYLES.map((s) => (
                  <button key={s.id} type="button" className={chip(s.id === styleId)} onClick={() => setStyleId(s.id)} title={s.note}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className={label}>Font</span>
              <div className="flex flex-wrap gap-1.5">
                {FONTS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className={chip(f.id === fontId)}
                    onClick={() => pickFont(f)}
                    style={fontState[f.id] === 'ok' ? { fontFamily: f.head } : undefined}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label className="block">
                <span className={label}>Headline</span>
                <input className={input} value={head} maxLength={60} onChange={(e) => setHeadline(e.target.value)} />
              </label>
              <label className="block">
                <span className={label}>Second line</span>
                <input className={input} value={sub} maxLength={80} onChange={(e) => setSubline(e.target.value)} />
              </label>
              <div>
                <span className={label}>Bottom banner</span>
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={bannerOn} onChange={(e) => setBannerOn(e.target.checked)} aria-label="Show bottom banner" />
                  <input
                    className={`${input} disabled:opacity-40`}
                    value={bannerValue}
                    maxLength={140}
                    disabled={!bannerOn}
                    placeholder="Counties or a short message"
                    onChange={(e) => setBanner(e.target.value)}
                  />
                </div>
              </div>
              <label className="block">
                <span className={label}>Time zone</span>
                <select className={input} value={zone} onChange={(e) => setZone(e.target.value)}>
                  {TIME_ZONES.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={showLegend} onChange={(e) => setShowLegend(e.target.checked)} /> Color scale
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={showList} onChange={(e) => setShowList(e.target.checked)} disabled={!info.warnings.length} /> Warning list
                  {!info.warnings.length && <span className="text-slate-500">(none in view)</span>}
                </label>
              </div>
            </div>

            <div>
              <span className={label}>Caption</span>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {captions.map((c) => (
                  <button key={c.id} type="button" className={chip(c.id === caption.id)} onClick={() => setCaptionId(c.id)}>
                    {c.label}
                  </button>
                ))}
              </div>
              <textarea
                className={`${input} h-40 resize-y text-xs leading-relaxed`}
                value={captionText}
                onChange={(e) => setEdits((s) => ({ ...s, [caption.id]: e.target.value }))}
                aria-label="Caption text"
              />
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={link} onChange={(e) => setLink(e.target.checked)} /> Radar link
                </label>
                {tag && (
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" checked={tags} onChange={(e) => setTags(e.target.checked)} /> {tag}
                  </label>
                )}
                {edits[caption.id] != null && (
                  <button type="button" className="ml-auto text-amber-300 hover:text-amber-200" onClick={() => setEdits((s) => ({ ...s, [caption.id]: undefined }))}>
                    Undo my edits
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={download} className={`${chip(true)} flex items-center gap-1.5`}>
                <Download className="w-4 h-4" /> Save image
              </button>
              <button type="button" onClick={() => copyCaption(false)} className={`${chip(false)} flex items-center gap-1.5`}>
                <Copy className="w-4 h-4" /> Copy caption
              </button>
              {canShare && (
                <button type="button" onClick={share} className={`${chip(false)} flex items-center gap-1.5`}>
                  <Share2 className="w-4 h-4" /> Share
                </button>
              )}
            </div>
            {message && <p className="text-xs text-emerald-300">{message}</p>}
            <p className="text-[11px] leading-snug text-slate-400">
              Facebook doesn&apos;t accept caption text from other apps, so add the image to your post and paste the caption. Warnings listed are the ones
              shown in the picture; check weather.gov before posting.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
