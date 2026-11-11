// Extract lightning flashes from one GOES GLM Level 2 "LCFA" file (netCDF4/HDF5).
//
// Each flash: centroid latitude/longitude and the time of its first optical
// event. GLM detects TOTAL lightning (in-cloud and cloud-to-ground) from orbit;
// locations are accurate to roughly one GLM pixel (about 8-14 km).

import * as hdf5 from 'jsfive';

// flash_time_offset_of_first_event is stored as an unsigned 16-bit integer:
// seconds = raw * scale_factor + add_offset, relative to the file's start time.
// These are the GOES-R product definition values (confirmed in live files with
// h5py); used only if the file's own attributes can't be read.
const TIME_SCALE = 0.00038147560553625226;
const TIME_OFFSET = -5.0;

// North America view. GOES-East (G19) supplies flashes east of 110°W and
// GOES-West (G18) west of it, so no flash is shown twice.
const REGION = { south: 10, north: 62, west: -170, east: -50 };
const SPLIT_LON = -110;

// "..._s20263151645400_e20263151646000_c..." -> Date (UTC). Format: yyyy ddd hh mm ss t(enths)
export function parseGlmTime(token) {
  const y = +token.slice(0, 4), doy = +token.slice(4, 7);
  const h = +token.slice(7, 9), mi = +token.slice(9, 11), s = +token.slice(11, 13), t = +token.slice(13, 14);
  return new Date(Date.UTC(y, 0, doy, h, mi, s, t * 100));
}

export function fileTimes(key) {
  const m = key.match(/_s(\d{14})_e(\d{14})_c(\d{14})/);
  if (!m) return null;
  return { start: parseGlmTime(m[1]), end: parseGlmTime(m[2]), created: parseGlmTime(m[3]) };
}

function attr(ds, name, fallback) {
  try {
    const v = ds.attrs?.[name];
    const n = Array.isArray(v) ? v[0] : v;
    return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

// sat: '19' or '18'. Returns [[lat, lon, secondsAfterFileStart], ...] (rounded).
export function extractFlashes(arrayBuffer, sat, start, end) {
  const f = new hdf5.File(arrayBuffer, 'glm.nc');
  const lat = f.get('flash_lat').value;
  const lon = f.get('flash_lon').value;
  const q = f.get('flash_quality_flag').value;
  const tDs = f.get('flash_time_offset_of_first_event');
  const tRaw = tDs.value;
  const scale = attr(tDs, 'scale_factor', TIME_SCALE);
  const offset = attr(tDs, 'add_offset', TIME_OFFSET);
  const span = (end - start) / 1000;

  const out = [];
  for (let i = 0; i < lat.length; i++) {
    if (q[i] !== 0) continue; // keep only flashes the product marks as good quality
    const la = lat[i], lo = lon[i];
    if (la < REGION.south || la > REGION.north || lo < REGION.west || lo > REGION.east) continue;
    if (sat === '19' ? lo < SPLIT_LON : lo >= SPLIT_LON) continue;
    const raw = tRaw[i] < 0 ? tRaw[i] + 65536 : tRaw[i]; // stored as unsigned
    const t = raw * scale + offset;
    if (!(t >= -5 && t <= span + 1)) continue; // sanity: must fall within (or just before) the file period
    out.push([Math.round(la * 1000) / 1000, Math.round(lo * 1000) / 1000, Math.round(t * 10) / 10]);
  }
  return out;
}
