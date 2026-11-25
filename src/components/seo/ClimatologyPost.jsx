import React, { useEffect, useState } from 'react';
import { X, Download, Share2, Copy } from 'lucide-react';
import { renderClimPost, CLIM_SIZES } from '../../climatology/post';
import { saveFile, savedMessage, isPhone } from '../../utils/saveFile';
import SaveImageSheet from '../SaveImageSheet';

// Post maker for /tornado-season: the month's risk map as an image in three
// sizes, with a caption made from the same numbers as the page.
// info: { title, monthName, month (shapes), colors, caption, fileBase }
export default function ClimatologyPost({ info, onClose }) {
  const [sizeId, setSizeId] = useState('square');
  const [pic, setPic] = useState({ status: 'loading' });
  const [caption, setCaption] = useState(info.caption);
  const [note, setNote] = useState(null);
  const [sheet, setSheet] = useState(null);
  const size = CLIM_SIZES.find((s) => s.id === sizeId);
  const fileName = `${info.fileBase}-${sizeId}.png`;

  useEffect(() => {
    let alive = true;
    let url;
    setPic({ status: 'loading' });
    renderClimPost({ size, month: info.month, colors: info.colors, title: info.title, monthName: info.monthName })
      .then((canvas) => new Promise((resolve) => canvas.toBlob(resolve, 'image/png')))
      .then((blob) => {
        if (!alive) return;
        url = URL.createObjectURL(blob);
        setPic({ status: 'ok', blob, url });
      })
      .catch(() => alive && setPic({ status: 'error' }));
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [sizeId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const file = pic.blob && new File([pic.blob], fileName, { type: 'image/png' });
  const canShare = !!file && typeof navigator !== 'undefined' && !!navigator.canShare?.({ files: [file] });
  const save = () => {
    if (isPhone()) setSheet({ blob: pic.blob, name: fileName });
    else {
      saveFile(pic.blob, fileName);
      setNote(savedMessage());
    }
  };
  const share = async () => {
    try {
      await navigator.share({ files: [file], text: caption });
    } catch {
      // closed the share sheet
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(caption);
      setNote('Caption copied.');
    } catch {
      setNote('Copy didn’t work here. Select the caption and copy it.');
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Make a post">
      <div className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h2 className="font-semibold text-white">Make a post</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-slate-300 hover:bg-slate-800">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 md:grid-cols-[1fr_300px]">
          <div className="flex min-h-[240px] items-center justify-center rounded-xl bg-slate-950">
            {pic.status === 'ok' ? (
              <img src={pic.url} alt={`${info.title}, ${info.monthName}`} className="max-h-[60vh] w-auto max-w-full rounded" />
            ) : pic.status === 'error' ? (
              <p className="p-6 text-center text-sm text-red-300">The image couldn&apos;t be made. Check your connection and try again.</p>
            ) : (
              <p className="p-6 text-sm text-slate-400">Making the image…</p>
            )}
          </div>
          <div className="space-y-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Size</div>
              <div className="mt-2 flex gap-2">
                {CLIM_SIZES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSizeId(s.id)}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${s.id === sizeId ? 'border-sky-400 text-sky-200' : 'border-slate-700 text-slate-300 hover:bg-slate-800'}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {size.w} x {size.h}
              </div>
            </div>
            <div>
              <label htmlFor="clim-caption" className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Caption
              </label>
              <textarea
                id="clim-caption"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={7}
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5 text-sm text-slate-200"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pic.status !== 'ok'}
                onClick={save}
                className="inline-flex items-center gap-2 rounded-lg ws-spectrum px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"
              >
                <Download className="h-4 w-4" /> {isPhone() ? 'Save to phone' : 'Save image'}
              </button>
              {canShare && (
                <button type="button" onClick={share} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800">
                  <Share2 className="h-4 w-4" /> Share
                </button>
              )}
              <button type="button" onClick={copy} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800">
                <Copy className="h-4 w-4" /> Copy caption
              </button>
            </div>
            {note && <p className="text-xs text-slate-400">{note}</p>}
          </div>
        </div>
      </div>
      {sheet && <SaveImageSheet blob={sheet.blob} name={sheet.name} onClose={() => setSheet(null)} />}
    </div>
  );
}
