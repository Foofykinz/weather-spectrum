// Saved copies of archive data that never changes (the warnings, storm
// detections and radar file lists behind a historic event replay), served
// from this site (public/replays/<slug>.json) so every visitor doesn't
// download them again from the Iowa Environmental Mesonet, the NWS and the
// radar archive. Anything not saved is fetched as usual.
//
// archiveFetch() is used only for archive requests (past times). Live data
// never goes through it.
//
// Recording (scripts/record-replays.mjs): with ?record=1 on an event page,
// every archive response is kept in window.__replayRecord as it arrives.

const saved = new Map(); // url -> response text
let recorder = null;

export function addSaved(entries) {
  for (const [url, text] of Object.entries(entries || {})) saved.set(url, text);
}

export function startRecording() {
  recorder = {};
  if (typeof window !== 'undefined') window.__replayRecord = recorder;
  return recorder;
}

export async function archiveFetch(url, opts = {}) {
  const hit = saved.get(url);
  if (hit != null) return new Response(hit, { status: 200 });
  const res = await fetch(url, opts);
  if (recorder && res.ok) recorder[url] = await res.clone().text();
  return res;
}
