// Post maker memory, kept in this browser only:
// - a draft: the post being worked on, saved as it changes, offered back the
//   next time the post maker opens;
// - templates: named looks (size, style, font, header, box spots, and
//   optionally the labels and arrows) to reuse on later posts.
// kind: 'radar' | 'tornado' (each post maker keeps its own).

import { useEffect, useRef, useState } from 'react';

const DRAFT_DAYS = 14;
// Text typed into a post (headline, banner, caption) often names an alert and
// its end time. Older than this, a restored draft leaves it out so expired
// alert details don't end up in a new post.
export const TEXT_FRESH_MS = 3 * 3600e3;
const TEXT_FIELDS = ['headline', 'subline', 'banner', 'edits'];

// The parts of a draft that are safe to bring back now.
export function restorable(draft) {
  if (!draft) return null;
  if (Date.now() - draft.at <= TEXT_FRESH_MS) return draft.state;
  return Object.fromEntries(Object.entries(draft.state).filter(([k]) => !TEXT_FIELDS.includes(k)));
}
export const textIsStale = (draft) => !!draft && Date.now() - draft.at > TEXT_FRESH_MS;

// Labels and arrows are pinned to map spots. Ones saved for another area would
// sit off this picture (or over the wrong town), so only marks that land on
// this picture are kept. view: makeView() result.
export function marksInView(marks, view) {
  const list = Array.isArray(marks) ? marks : [];
  if (!view) return { kept: [], dropped: list.length };
  const { area } = view;
  const on = (ll) => {
    if (!ll || !Number.isFinite(ll.lat) || !Number.isFinite(ll.lng)) return false;
    const p = view.toCanvas(ll);
    return p.x >= area.x && p.x <= area.x + area.w && p.y >= area.y && p.y <= area.y + area.h;
  };
  const kept = list.filter((m) => on(m.a) || on(m.b));
  return { kept, dropped: list.length - kept.length };
}
export const droppedNote = (n) =>
  n ? ` ${n} label${n === 1 ? '' : 's'}/arrow${n === 1 ? '' : 's'} for another area ${n === 1 ? 'was' : 'were'} left out.` : '';
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
  return d;
}

// Saves `state` as the draft whenever it changes, but only once it differs
// from how the post maker opened (just opening it saves nothing).
// Returns [lastSavedAt, clear].
export function useAutosave(kind, state) {
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
    return Array.isArray(v) ? v.filter((t) => t && t.id && t.name && t.state) : [];
  });
  const store = (next) => {
    if (write(templatesKey(kind), next)) setList(next);
    return next;
  };
  const save = (name, state) => {
    const clean = String(name || '').trim().slice(0, 40) || 'My template';
    const existing = list.find((t) => t.name.toLowerCase() === clean.toLowerCase());
    const t = { id: existing?.id || `t${Date.now().toString(36)}`, name: clean, at: Date.now(), state };
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
