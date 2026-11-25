import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Copy, Share2, X, Layers } from 'lucide-react';
import { SIZES, VERTICAL, FONTS, loadFont } from '../../radar/post';
import { STYLES, mapArea, framePadding, renderClimMap, drawPost, buildCaptions, defaultHeadline, defaultSubline } from '../../climatology/post';
import BrandPanel from '../BrandPanel';
import { useBrand } from '../../brand/brand';
import { saveFile, savedMessage, isPhone, saveAll } from '../../utils/saveFile';
import SaveImageSheet from '../SaveImageSheet';
import { makeView, drawMarks, loadLabelFont } from '../../posts/marks';
import HeaderEditor from '../radar/HeaderEditor';
import { loadDraft, restorable, useAutosave, useTemplates } from '../../posts/drafts';
import { DraftBar, TemplatesPanel } from '../PostMemory';
import { useMarkEditor } from '../MarkEditor';
import { stateName } from '../../seo/places';

// Post maker for /tornado-season, with the same options as the radar and
// tornado warning post makers: sizes, styles, fonts, header, branding, labels
// and arrows, templates, autosave and every size at once.
// info: { hazardId, hazard, monthName, month (shapes), sel, years, monthIndex }
const ALL_SIZES = [...SIZES, { ...VERTICAL, label: 'Story' }];
const PAGE = 'https://theweatherspectrum.com/tornado-season';

// The month's map at the post's map size, drawn off screen and kept (so labels
// can be pinned to it) until the next one replaces it.
function useClimPicture(info, size, styleId, layoutHd, key) {
  const [pic, setPic] = useState({ status: 'working' });
  const area = mapArea(size, styleId, layoutHd);
  const pad = framePadding(size, styleId, { key });
  const sig = `${size.id}|${styleId}|${area.w}x${area.h}|${pad.top},${pad.bottom}|${info.hazardId}|${info.monthIndex}`;
  useEffect(() => {
    let alive = true;
    let made = null;
    setPic((p) => ({ ...p, status: 'working' }));
    renderClimMap(area, info.month, info.hazard.colors, pad)
      .then((r) => {
        made = r;
        if (alive) setPic({ status: 'ok', snap: r.snap, sig });
        else r.remove();
      })
      .catch(() => alive && setPic({ status: 'error' }));
    return () => {
      alive = false;
      made?.remove();
    };
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  return pic;
}

export default function ClimatologyPost({ info, onClose }) {
  const [sizeId, setSizeId] = useState('square');
  const [styleId, setStyleId] = useState('risk');
  const [fontId, setFontId] = useState('system');
  const [fontState, setFontState] = useState({});
  const [areaLabels, setAreaLabels] = useState(true);
  const [key, setKey] = useState(false);
  const [tabColor, setTabColor] = useState(null);
  const [monthColor, setMonthColor] = useState(null);
  const [link, setLink] = useState(true);
  const [captionId, setCaptionId] = useState('summary');
  const [edits, setEdits] = useState({});
  const [headline, setHeadline] = useState(null);
  const [subline, setSubline] = useState(null);
  // Header look (radar/postHeader), shared with the other post makers and remembered in this browser.
  const [header, setHeaderState] = useState(() => {
    try {
      const v = JSON.parse(localStorage.getItem('ws-post-header') || '{}');
      return v && typeof v === 'object' ? v : {};
    } catch {
      return {};
    }
  });
  const setHeader = (next) => {
    setHeaderState(next);
    try {
      localStorage.setItem('ws-post-header', JSON.stringify(next));
    } catch {
      // not remembered; still used for this post
    }
  };
  const [headerFontTick, setHeaderFontTick] = useState(0);
  const pickHeaderFont = (id) => loadLabelFont(id).then(() => setHeaderFontTick((t) => t + 1));
  useEffect(() => {
    if (header.font) pickHeaderFont(header.font);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const layoutHd = useMemo(
    () => ({ position: header.position, height: header.height, bg: header.bg === 'glass' ? 'glass' : undefined }),
    [header.position, header.height, header.bg === 'glass'] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [tab, setTab] = useState('picture');
  const [message, setMessage] = useState(null);
  const brandState = useBrand();
  const [brand, , { logoImg }] = brandState;
  const [myLink, setMyLink] = useState(true);
  const [saveSheet, setSaveSheet] = useState(null);
  const [format, setFormat] = useState('png');
  const mime = `image/${format}`;
  const preview = useRef(null);

  const size = ALL_SIZES.find((s) => s.id === sizeId);
  const style = STYLES.find((s) => s.id === styleId);
  const font = FONTS.find((f) => f.id === fontId);
  const pic = useClimPicture(info, size, styleId, styleId === 'spectrum' ? layoutHd : null, key);
  const stampLogo = brand.enabled ? logoImg : null;
  const viewFor = (p, s) => (p?.snap ? makeView(p.snap, { x: 0, y: 0, w: p.snap.canvas.width, h: p.snap.canvas.height }, mapArea(s, styleId, styleId === 'spectrum' ? layoutHd : null)) : null);
  const view = useMemo(() => viewFor(pic, size), [pic, size, styleId, layoutHd]); // eslint-disable-line react-hooks/exhaustive-deps
  const [moves, setMoves] = useState({});
  const boxRects = useRef({});
  const [, setRectsKey] = useState('');
  const boxes = useMemo(() => (styleId === 'map' ? null : { rects: boxRects, set: (id, m) => setMoves((s) => ({ ...s, [id]: m })) }), [styleId, moves]);
  const onTap = (kind, d) => {
    if (kind === 'mark') return setTab('marks');
    if (kind === 'box') return setTab(d === 'head' ? 'header' : 'picture');
    const r = boxRects.current?.regions?.header;
    if (r && d.x >= r.x && d.x <= r.x + r.w && d.y >= r.y && d.y <= r.y + r.h) setTab('header');
    return undefined;
  };
  const markEd = useMarkEditor({ canvasRef: preview, view, font: font.body, logoImg: stampLogo, boxes, onTap });

  // ---- Autosave and templates (kept in this browser): the look only, never
  // the wording or labels (posts/drafts).
  const [draftOffer, setDraftOffer] = useState(() => loadDraft('climo'));
  const current = { sizeId, styleId, fontId, areaLabels, key, tabColor, monthColor, header, moves, captionId, format };
  useAutosave('climo', current);
  const templates = useTemplates('climo');
  const applyState = (st) => {
    if (st.sizeId !== undefined) setSizeId(st.sizeId);
    if (st.styleId !== undefined) setStyleId(st.styleId);
    if (st.areaLabels !== undefined) setAreaLabels(st.areaLabels);
    if (st.key !== undefined) setKey(st.key);
    if (st.tabColor !== undefined) setTabColor(st.tabColor);
    if (st.monthColor !== undefined) setMonthColor(st.monthColor);
    if (st.moves !== undefined) setMoves(st.moves);
    if (st.captionId !== undefined) setCaptionId(st.captionId);
    if (st.format !== undefined) setFormat(st.format);
    if (st.fontId !== undefined) {
      const f = FONTS.find((x) => x.id === st.fontId);
      if (f) pickFont(f);
    }
    if (st.header !== undefined) {
      setHeader(st.header || {});
      if (st.header?.font) pickHeaderFont(st.header.font);
    }
  };
  const saveTemplate = (name) => templates.save(name, { sizeId, styleId, fontId, areaLabels, key, tabColor, monthColor, header, moves, format });
  const head = headline ?? defaultHeadline(info);
  const sub = subline ?? defaultSubline(info);
  const fontReady = !font.css || fontState[font.id] === 'ok' || fontState[font.id] === 'failed';

  const shareUrl = `${PAGE}?m=${info.monthIndex + 1}${info.hazardId === 'tornado' ? '' : `&h=${info.hazardId}`}`;
  const captions = useMemo(() => buildCaptions(info, { link: link ? shareUrl : null, stateName }), [info, link, shareUrl]);
  const caption = captions.find((c) => c.id === captionId) || captions[0];
  const brandLink = brand.enabled && myLink ? brand.link.trim() : '';
  const captionText = edits[caption.id] ?? (brandLink ? `${caption.text}\n\n${brandLink}` : caption.text);

  const drawOpts = (s) => ({
    size: s,
    style,
    font: fontState[font.id] === 'failed' ? FONTS[0] : font,
    headline: head,
    subline: sub,
    brand,
    logoImg,
    moves,
    header: styleId === 'spectrum' || styleId === 'clean' ? header : { logoSize: header.logoSize },
    areaLabels,
    key,
    tabColor,
    monthColor,
  });
  useEffect(() => {
    if (!preview.current || !fontReady || pic.status !== 'ok') return;
    boxRects.current = drawPost(preview.current, pic, info, drawOpts(size)) || {};
    setRectsKey(JSON.stringify(boxRects.current));
    drawMarks(preview.current, markEd.marks, view, { font: font.body, logoImg: stampLogo });
  }, [pic, info, size, style, font, fontState, fontReady, head, sub, brand, logoImg, markEd.marks, view, moves, header, headerFontTick, areaLabels, key, tabColor, monthColor]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickFont = async (f) => {
    setFontId(f.id);
    if (!f.css || fontState[f.id]) return;
    setFontState((s) => ({ ...s, [f.id]: 'loading' }));
    const ok = await loadFont(f);
    setFontState((s) => ({ ...s, [f.id]: ok ? 'ok' : 'failed' }));
  };

  const fileName = (s = size) => `${info.hazardId}-risk-${info.monthName.toLowerCase()}-${s.id === 'vertical' ? 'story' : s.id}.${format === 'jpeg' ? 'jpg' : 'png'}`;
  const toBlob = (canvas = preview.current) => new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('no image'))), mime, 0.92));

  // "Make all sizes": each size laid out for its shape, one after another.
  const [batch, setBatch] = useState(null); // { i } while making; { files, done: true } when ready
  const batchSig = JSON.stringify([markEd.marks, moves, styleId, fontId, head, sub, format, brand, !!logoImg, header, areaLabels, key, tabColor, monthColor]);
  useEffect(() => setBatch(null), [batchSig]);
  const makeAll = async () => {
    setMessage(null);
    const files = [];
    try {
      for (let i = 0; i < ALL_SIZES.length; i++) {
        setBatch({ i });
        const s = ALL_SIZES[i];
        const hd = styleId === 'spectrum' ? layoutHd : null;
        const r = await renderClimMap(mapArea(s, styleId, hd), info.month, info.hazard.colors, framePadding(s, styleId, { key }));
        try {
          const c = document.createElement('canvas');
          drawPost(c, r, info, drawOpts(s));
          drawMarks(c, markEd.marks, makeView(r.snap, { x: 0, y: 0, w: r.snap.canvas.width, h: r.snap.canvas.height }, mapArea(s, styleId, hd)), { font: font.body, logoImg: stampLogo });
          files.push({ name: fileName(s), blob: await toBlob(c) });
        } finally {
          r.remove();
        }
      }
      setBatch({ files, done: true });
    } catch {
      setBatch(null);
      setMessage("The images couldn't be made. Check your connection and try again.");
    }
  };
  const saveBatch = async () => setMessage(await saveAll(batch.files, `${info.hazardId}-risk-${info.monthName.toLowerCase()}-all-sizes.zip`));

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
      if (isPhone()) return setSaveSheet({ blob, name: fileName() });
      saveFile(blob, fileName());
      setMessage(savedMessage('Image'));
    } catch {
      setMessage("The image couldn't be made in this browser.");
    }
    return undefined;
  };
  const canShare = typeof navigator !== 'undefined' && !!navigator.canShare && navigator.canShare({ files: [new File([''], 'a.png', { type: 'image/png' })] });
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

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const chip = (on) => `rounded-md border px-2.5 py-1.5 text-xs font-semibold ${on ? 'border-sky-400/70 bg-sky-400/15 text-sky-200' : 'border-slate-700/80 text-slate-300 hover:bg-slate-800'}`;
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
  const colorRow = (text, value, fallback, set) => (
    <label className="flex items-center gap-2 text-xs text-slate-300">
      <input type="color" value={(value || fallback).toLowerCase()} onChange={(e) => set(e.target.value)} className="h-7 w-9 cursor-pointer rounded border border-slate-700 bg-transparent p-0" aria-label={text} />
      <span className="flex-1">{text}</span>
      {value && (
        <button type="button" className="text-sky-300 hover:text-sky-200" onClick={() => set(null)}>
          Reset
        </button>
      )}
    </label>
  );

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/70 p-1 sm:p-4" onClick={onClose}>
      {saveSheet && (
        <div onClick={(e) => e.stopPropagation()}>
          <SaveImageSheet blob={saveSheet.blob} name={saveSheet.name} onClose={() => setSaveSheet(null)} />
        </div>
      )}
      <div
        role="dialog"
        aria-label="Make a post"
        className="flex h-[calc(100dvh-0.5rem)] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-700/80 bg-slate-900 text-slate-200 shadow-2xl sm:h-[calc(100dvh-2rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-800 px-4 py-2.5">
          <h2 className="text-sm font-semibold">Make a post</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-slate-400 hover:text-slate-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col md:grid md:grid-cols-[minmax(0,1fr)_23rem]">
          <div className="shrink-0 space-y-2 overflow-y-auto p-2 sm:p-3 md:min-h-0 md:p-4">
            <div className="relative mx-auto w-fit max-w-full">
              <canvas ref={preview} {...markEd.canvasProps} className="block h-auto max-h-[34dvh] md:max-h-[calc(100dvh-15rem)] w-auto max-w-full rounded-md border border-slate-800" />
              {markEd.overlay}
              {pic.status === 'working' && <div className="absolute inset-x-0 top-3 mx-auto w-fit rounded-md bg-slate-950/90 px-3 py-1.5 text-xs text-slate-200">Drawing the map…</div>}
            </div>
            {pic.status === 'error' && <p className="text-xs text-red-300">The map couldn&apos;t be drawn. Check your connection and try again.</p>}
            {!fontReady && <p className="text-xs text-slate-400">Loading font…</p>}
            {fontState[font.id] === 'failed' && <p className="text-xs text-amber-300">That font couldn&apos;t load, so a standard font is used.</p>}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={download} disabled={pic.status !== 'ok'} className={`${chip(true)} flex items-center gap-1.5 disabled:opacity-50`}>
                <Download className="w-4 h-4" /> {isPhone() ? 'Save to phone' : 'Save image'}
              </button>
              <button type="button" onClick={() => copyCaption(false)} className={`${chip(false)} flex items-center gap-1.5`}>
                <Copy className="w-4 h-4" /> Copy caption
              </button>
              {canShare && (
                <button type="button" onClick={share} disabled={pic.status !== 'ok'} className={`${chip(false)} flex items-center gap-1.5 disabled:opacity-50`}>
                  <Share2 className="w-4 h-4" /> Share
                </button>
              )}
              {batch?.done ? (
                <button type="button" onClick={saveBatch} className={`${chip(true)} flex items-center gap-1.5`}>
                  <Download className="w-4 h-4" /> Save all {batch.files.length} sizes
                </button>
              ) : (
                <button type="button" onClick={makeAll} disabled={!!batch} title="Square, Wide, Tall and Story, each laid out for its shape" className={`${chip(false)} flex items-center gap-1.5 disabled:opacity-50`}>
                  <Layers className="w-4 h-4" /> {batch ? `Making ${batch.i + 1} of ${ALL_SIZES.length}...` : 'Make all sizes'}
                </button>
              )}
            </div>
            {message && <p className="text-xs text-emerald-300">{message}</p>}
          </div>

          <div className="flex min-h-0 flex-1 flex-col border-t border-slate-800 md:border-l md:border-t-0">
            <div className="flex shrink-0 gap-1 border-b border-slate-800 p-1.5" role="tablist">
              {[['picture', 'Picture'], ...(styleId === 'map' ? [] : [['header', 'Header']]), ['marks', 'Labels & arrows'], ['caption', 'Caption']].map(([id, t]) => (
                <button key={id} type="button" role="tab" aria-selected={tab === id} className={`${chip(tab === id)} flex-1 whitespace-nowrap px-1.5`} onClick={() => setTab(id)}>
                  {t}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
              <DraftBar
                draft={draftOffer}
                ready={!!view}
                onRestore={() => {
                  applyState(restorable(draftOffer));
                  setDraftOffer(null);
                }}
                onDiscard={() => setDraftOffer(null)}
              />
              {(tab === 'picture' || (tab === 'header' && styleId === 'map')) && (
                <>
                  <TemplatesPanel templates={templates} onApply={applyState} onSave={saveTemplate} />
                  <div>
                    <span className={label}>Size</span>
                    {choices(ALL_SIZES.map((s) => [s.id, s.label, s.note]), sizeId, setSizeId)}
                  </div>
                  <div>
                    <span className={label}>Style</span>
                    {choices(STYLES.map((s) => [s.id, s.label, s.note]), styleId, setStyleId)}
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
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" checked={areaLabels} onChange={(e) => setAreaLabels(e.target.checked)} /> Typical / Greater labels
                    </label>
                    {styleId !== 'map' && (
                      <label className="flex items-center gap-1.5">
                        <input type="checkbox" checked={key} onChange={(e) => setKey(e.target.checked)} /> Key
                      </label>
                    )}
                  </div>
                  <div>
                    <span className={label}>File type</span>
                    {choices([['png', 'PNG', 'Sharpest'], ['jpeg', 'JPEG', 'Smaller file']], format, setFormat)}
                  </div>
                  {Object.keys(moves).length > 0 && styleId !== 'map' && (
                    <button type="button" className="-mt-2 text-xs text-sky-300 hover:text-sky-200" onClick={() => setMoves({})}>
                      Put the boxes back
                    </button>
                  )}
                  <BrandPanel brandState={brandState} />
                </>
              )}
              {tab === 'header' && styleId !== 'map' && (
                <div className="space-y-2">
                  <label className="block">
                    <span className={label}>{styleId === 'risk' ? 'Title' : 'Headline'}</span>
                    <input className={input} value={head} maxLength={60} onChange={(e) => setHeadline(e.target.value)} />
                  </label>
                  <label className="block">
                    <span className={label}>{styleId === 'risk' ? 'Month tab' : 'Second line'}</span>
                    <input className={input} value={sub} maxLength={80} onChange={(e) => setSubline(e.target.value)} />
                  </label>
                  {styleId === 'risk' ? (
                    <div className="space-y-2 pt-1">
                      {colorRow('Title tab color', tabColor, info.hazard.colors.typical, setTabColor)}
                      {colorRow('Month tab color', monthColor, '#ffffff', setMonthColor)}
                      <p className="text-[11px] leading-snug text-slate-400">Drag the title on the picture to move it, or use its corner to resize it.</p>
                    </div>
                  ) : (
                    <HeaderEditor value={header} onChange={setHeader} onFont={pickHeaderFont} band={styleId !== 'clean'} hasLogo={!!(brand.enabled && logoImg)} />
                  )}
                </div>
              )}
              {tab === 'marks' && markEd.panel}
              {tab === 'caption' && (
                <div className="space-y-2">
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
                    {brand.enabled && brand.link.trim() && (
                      <label className="flex items-center gap-1.5">
                        <input type="checkbox" checked={myLink} onChange={(e) => setMyLink(e.target.checked)} /> My link
                      </label>
                    )}
                    {edits[caption.id] != null && (
                      <button type="button" className="ml-auto text-sky-300 hover:text-sky-200" onClick={() => setEdits((s) => ({ ...s, [caption.id]: undefined }))}>
                        Undo my edits
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] leading-snug text-slate-400">
                    Facebook doesn&apos;t accept caption text from other apps, so add the image to your post and paste the caption. The numbers are the ones on
                    this page.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
