// Post maker memory, kept in this browser only:
// - a draft: the post's look, saved as it changes, offered back the next time
//   the post maker opens;
// - templates: named looks to reuse on later posts.
// Only design settings are ever saved (size, style, font, header look, colors,
// box spots, options). Wording never is: no headline, second line, banner,
// caption text, or labels and arrows. designOnly() enforces that on every
// save and on every read, so older saves that held text are cleaned too.
// kind: 'radar' | 'tornado' | 'climo' (each post maker keeps its own).

import { useEffect, useRef, useState } from 'react';

const DRAFT_DAYS = 14;
const CONTENT_FIELDS = ['headline', 'subline', 'banner', 'edits', 'marks', 'for'];
export const designOnly = (state) =>
  state && typeof state === 'object' ? Object.fromEntries(Object.entries(state).filter(([k]) => !CONTENT_FIELDS.includes(k))) : null;
const hasContent = (state) => !!state && typeof state === 'object' && CONTENT_FIELDS.some((k) => k in state);

// The parts of a draft to bring back (its look).
export const restorable = (draft) => (draft ? designOnly(draft.state) : null);

const MAX_TEMPLATES = 40;
const draftKey = (kind) => `ws-post-draft-${kind}`;
const templatesKey = (kind) => `ws-post-templates-${kind}`;

function read(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null');
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
function write(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // storage full or blocked: nothing saved
  }
}

// The draft saved last time, if it's recent: { at, state }.
export function loadDraft(kind) {
  const d = read(draftKey(kind), null);
  if (!d?.state || !Number.isFinite(d.at) || Date.now() - d.at > DRAFT_DAYS * 864e5) return null;
  const clean = { at: d.at, state: designOnly(d.state) };
  if (hasContent(d.state)) write(draftKey(kind), clean); // drop text saved by older versions
  return clean;
}

// Saves `state` as the draft whenever it changes, but only once it differs
// from how the post maker opened (just opening it saves nothing).
// Returns [lastSavedAt, clear].
export function useAutosave(kind, full) {
  const state = designOnly(full);
  const sig = JSON.stringify(state);
  const first = useRef(sig);
  const [savedAt, setSavedAt] = useState(null);
  useEffect(() => {
    if (sig === first.current) return undefined;
    const t = setTimeout(() => {
      if (write(draftKey(kind), { at: Date.now(), state })) setSavedAt(new Date());
    }, 700);
    return () => clearTimeout(t);
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  const clear = () => {
    write(draftKey(kind), null);
    first.current = sig;
    setSavedAt(null);
  };
  return [savedAt, clear];
}

export function useTemplates(kind) {
  const [list, setList] = useState(() => {
    const v = read(templatesKey(kind), []);
    const list = Array.isArray(v) ? v.filter((t) => t && t.id && t.name && t.state) : [];
    if (list.some((t) => hasContent(t.state))) {
      const clean = list.map((t) => ({ ...t, state: designOnly(t.state) }));
      write(templatesKey(kind), clean); // drop text saved by older versions
      return clean;
    }
    return list;
  });
  const store = (next) => {
    if (write(templatesKey(kind), next)) setList(next);
    return next;
  };
  const save = (name, state) => {
    const clean = String(name || '').trim().slice(0, 40) || 'My template';
    const existing = list.find((t) => t.name.toLowerCase() === clean.toLowerCase());
    const t = { id: existing?.id || `t${Date.now().toString(36)}`, name: clean, at: Date.now(), state: designOnly(state) };
    return store([t, ...list.filter((x) => x.id !== t.id)].slice(0, MAX_TEMPLATES));
  };
  const remove = (id) => store(list.filter((t) => t.id !== id));
  return { list, save, remove };
}

export function agoText(at) {
  const m = Math.round((Date.now() - at) / 60e3);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}
