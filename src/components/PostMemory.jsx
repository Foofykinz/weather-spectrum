import React, { useState } from 'react';
import { History, Trash2, Bookmark } from 'lucide-react';
import { agoText, textIsStale, droppedNote } from '../posts/drafts';

const chip = (on) =>
  `flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold ${
    on ? 'border-sky-400/70 bg-sky-400/15 text-sky-200' : 'border-slate-700/80 text-slate-300 hover:bg-slate-800'
  }`;

// "Pick up where you left off?" bar for the saved draft.
// onRestore returns how many marks were left out (another area).
// ready: the picture is loaded (needed to place labels and arrows).
export function DraftBar({ draft, onRestore, onDiscard, ready }) {
  const [note, setNote] = useState('');
  if (!draft) return note ? <p className="text-[11px] text-emerald-300">{note}</p> : null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-sky-400/40 bg-sky-400/10 px-3 py-2 text-xs text-sky-100">
      <History className="h-4 w-4 shrink-0 text-sky-300" />
      <span className="flex-1">
        Pick up where you left off? Your last post was saved {agoText(draft.at)}.
        {textIsStale(draft)
          ? ' Its look, labels and arrows come back; the headline, banner and caption text don’t, so old alert details stay out. Check your labels too.'
          : ' Check that labels and text still match the current alerts.'}
      </span>
      <button
        type="button"
        className={`${chip(true)} disabled:opacity-50`}
        disabled={!ready}
        onClick={() => setNote(`Restored.${droppedNote(onRestore())}`)}
      >
        {ready ? 'Restore' : 'Loading...'}
      </button>
      <button type="button" className={chip(false)} onClick={onDiscard}>
        Discard
      </button>
    </div>
  );
}

// Saved looks: apply one, save the current look, delete.
// hasMarks: the post has labels / arrows that could go in the template.
export function TemplatesPanel({ templates, onApply, onSave, hasMarks }) {
  const [name, setName] = useState('');
  const [withMarks, setWithMarks] = useState(false);
  const [note, setNote] = useState('');
  return (
    <div className="space-y-2 rounded-lg border border-slate-700/80 p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        <Bookmark className="h-3.5 w-3.5" /> Templates
      </div>
      {templates.list.length > 0 ? (
        <ul className="space-y-1">
          {templates.list.map((t) => (
            <li key={t.id} className="flex items-center gap-1.5">
              <button
                type="button"
                className={`${chip(false)} min-w-0 flex-1 justify-start`}
                onClick={() => {
                  setNote(`Applied "${t.name}".${droppedNote(onApply(t.state))}`);
                }}
                title="Use this look on this post"
              >
                <span className="truncate">{t.name}</span>
                {t.state.marks?.length ? <span className="ml-auto shrink-0 font-normal text-slate-500">+ marks</span> : null}
              </button>
              <button
                type="button"
                className="rounded p-1 text-slate-500 hover:text-red-300"
                onClick={() => {
                  if (window.confirm(`Delete the template "${t.name}"?`)) templates.remove(t.id);
                }}
                aria-label={`Delete template ${t.name}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-slate-500">Save this post&apos;s look (size, style, font, header and box spots) to reuse it on the next one.</p>
      )}
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          const n = name.trim() || 'My template';
          onSave(n, withMarks);
          setName('');
          setNote(`Saved "${n}".`);
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          placeholder="Name, e.g. Tornado warning look"
          aria-label="Template name"
          className="min-w-0 flex-1 rounded-md border border-slate-700/80 bg-slate-950 px-2 py-1 text-xs text-slate-100"
        />
        <button type="submit" className={chip(true)}>
          Save
        </button>
      </form>
      {hasMarks && (
        <label className="flex items-center gap-1.5 text-xs text-slate-300">
          <input type="checkbox" checked={withMarks} onChange={(e) => setWithMarks(e.target.checked)} /> Include my labels and arrows
        </label>
      )}
      {note && <p className="text-[11px] text-emerald-300">{note}</p>}
      <p className="text-[11px] text-slate-500">Saved in this browser. Headline, banner and caption text come from each new post.</p>
    </div>
  );
}
