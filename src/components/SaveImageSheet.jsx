import React, { useEffect, useState } from 'react';
import { X, Share2, Download } from 'lucide-react';
import { saveFile, isApple } from '../utils/saveFile';

// Phones: show the finished image full screen so it can be saved with the
// phone's own press-and-hold menu ("Save to Photos" on iPhone, "Download
// image" on Android). A web page can't put a file in the photo gallery
// itself; this menu, or the share sheet, is how phones allow it.
export default function SaveImageSheet({ blob, name, onClose }) {
  const [src, setSrc] = useState(null);
  const [note, setNote] = useState(null);
  useEffect(() => {
    // A data URL (not a blob: link) so every phone's image menu can save it.
    const r = new FileReader();
    r.onload = () => setSrc(r.result);
    r.readAsDataURL(blob);
    return () => r.abort();
  }, [blob]);

  const file = new File([blob], name, { type: blob.type });
  const canShare = typeof navigator !== 'undefined' && !!navigator.canShare?.({ files: [file] });
  const share = async () => {
    try {
      await navigator.share({ files: [file] });
    } catch (err) {
      if (err.name !== 'AbortError') setNote("Sharing didn't work here. Press and hold the image instead.");
    }
  };
  const apple = isApple();

  return (
    <div className="fixed inset-0 z-[2100] flex flex-col bg-slate-950 text-slate-100" role="dialog" aria-label="Save image">
      <div className="flex items-start gap-3 border-b border-slate-800 px-4 py-3">
        <p className="flex-1 text-sm leading-snug">
          <span className="font-semibold text-amber-300">Press and hold the image</span>, then tap{' '}
          <span className="font-semibold">{apple ? 'Save to Photos' : 'Download image'}</span>.
          {!apple && <span className="block text-xs text-slate-400">It goes to your Gallery or Photos app (Download album).</span>}
        </p>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-slate-400 hover:text-slate-200">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-3">
        {src ? (
          <img src={src} alt="Your post image" className="max-h-full max-w-full rounded-md shadow-2xl" style={{ WebkitTouchCallout: 'default', userSelect: 'auto' }} />
        ) : (
          <span className="text-sm text-slate-400">Preparing the image…</span>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2 border-t border-slate-800 px-4 py-3">
        {canShare && (
          <button type="button" onClick={share} className="flex items-center gap-1.5 rounded-md border border-amber-500/70 bg-amber-500/15 px-3 py-2 text-sm font-semibold text-amber-200">
            <Share2 className="h-4 w-4" /> Share or save
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            saveFile(blob, name);
            setNote('Sent to Downloads. If it doesn’t show up, press and hold the image above instead.');
          }}
          className="flex items-center gap-1.5 rounded-md border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200"
        >
          <Download className="h-4 w-4" /> Download file
        </button>
        <button type="button" onClick={onClose} className="rounded-md border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-300">
          Done
        </button>
        {note && <p className="basis-full text-center text-xs text-slate-300">{note}</p>}
      </div>
    </div>
  );
}
