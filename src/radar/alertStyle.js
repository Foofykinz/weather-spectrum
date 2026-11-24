// The viewer's own look for alerts on the radar tool: a color per warning /
// watch type and how filled in the warning and wind / winter areas are
// (1 = solid color, 0.01 = barely visible; outlines fade only near the bottom).
// Saved in this browser. Only applies while the radar tool is open
// (activateAlertStyle); everywhere else, including the broadcast, keeps the
// NWS colors.

import { WARNING_TYPES, WATCH_TYPES } from './providers/warnings';
import { ZONE_TYPES } from '../broadcast/zoneAlerts';

const KEY = 'ws-alert-style';
export const STYLE_GROUPS = [
  ['Warnings', WARNING_TYPES],
  ['Watches', WATCH_TYPES],
  ['Wind and winter', ZONE_TYPES],
];
const ALL = STYLE_GROUPS.flatMap(([, list]) => list);
const DEFAULT = new Map(ALL.map((t) => [t, t.color]));
export const defaultColor = (t) => DEFAULT.get(t);
const isHex = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const DEFAULT_FILL = { warnFill: 0.1, zoneFill: 0.4 }; // close to the NWS-style look
const level = (v, d) => (Number.isFinite(v) && v >= 0.01 && v <= 1 ? v : d);

function load() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}');
    const colors = {};
    for (const [k, c] of Object.entries(v.colors || {})) if (isHex(c)) colors[k] = c;
    return { warnFill: level(v.warnFill, DEFAULT_FILL.warnFill), zoneFill: level(v.zoneFill, DEFAULT_FILL.zoneFill), colors };
  } catch {
    return { ...DEFAULT_FILL, colors: {} };
  }
}

let state = load();
let active = 0;
const listeners = new Set();

function applyColors() {
  for (const t of ALL) t.color = active && isHex(state.colors[t.event]) ? state.colors[t.event] : DEFAULT.get(t);
}
const notify = () => listeners.forEach((fn) => fn(state));

export const getAlertStyle = () => state;

export const defaultFill = (key) => DEFAULT_FILL[key];

// patch: { warnFill?, zoneFill?, colors? }
export function setAlertStyle(patch) {
  state = { ...state, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // not saved; still applies for this visit
  }
  applyColors();
  notify();
}

// Turns the viewer's style on; returns the function that turns it off.
export function activateAlertStyle() {
  active++;
  applyColors();
  notify();
  return () => {
    active--;
    applyColors();
    notify();
  };
}

export function subscribeAlertStyle(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// The viewer's fill level for 'warn' or 'zone' areas, or null where the
// viewer's style isn't on (draw the standard look).
export const alertFill = (kind) => (active ? state[kind === 'zone' ? 'zoneFill' : 'warnFill'] : null);
