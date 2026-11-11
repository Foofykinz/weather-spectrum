// Data for location and station pages.
//
// Radar facts come from the Iowa Environmental Mesonet NEXRAD network file
// (https://mesonet.agron.iastate.edu/geojson/network/NEXRAD.geojson, retrieved
// 2026-11-11): name, coordinates, ground elevation (m), NWS forecast office and
// county. Coverage numbers are computed from those coordinates with the same
// 4/3-Earth beam model the radar decoder uses. Nothing here is estimated by hand.

import { groundDistAz, beamHeightKm, slantRangeKm } from '../radar/level3/geometry';

export const RADARS = {
  TLX: { id: 'TLX', icao: 'KTLX', name: 'Oklahoma City', state: 'OK', lat: 35.3334, lon: -97.2779, elevationM: 368, wfo: 'OUN', county: 'Cleveland' },
  INX: { id: 'INX', icao: 'KINX', name: 'Tulsa', state: 'OK', lat: 36.175, lon: -95.564, elevationM: 228, wfo: 'TSA', county: 'Rogers' },
  FWS: { id: 'FWS', icao: 'KFWS', name: 'Dallas/Fort Worth', state: 'TX', lat: 32.573, lon: -97.303, elevationM: 236, wfo: 'FWD', county: 'Tarrant' },
  HGX: { id: 'HGX', icao: 'KHGX', name: 'Houston', state: 'TX', lat: 29.472, lon: -95.079, elevationM: 35, wfo: 'HGX', county: 'Galveston' },
  VNX: { id: 'VNX', icao: 'KVNX', name: 'Vance AFB', state: 'OK', lat: 36.741, lon: -98.128, elevationM: 383, wfo: 'OUN', county: 'Alfalfa' },
  FDR: { id: 'FDR', icao: 'KFDR', name: 'Frederick', state: 'OK', lat: 34.362, lon: -98.977, elevationM: 399, wfo: 'OUN', county: 'Tillman' },
  SRX: { id: 'SRX', icao: 'KSRX', name: 'Fort Smith', state: 'AR', lat: 35.29, lon: -94.362, elevationM: 224, wfo: 'TSA', county: 'Sebastian' },
  ICT: { id: 'ICT', icao: 'KICT', name: 'Wichita', state: 'KS', lat: 37.654, lon: -97.443, elevationM: 427, wfo: 'ICT', county: 'Sedgwick' },
  LCH: { id: 'LCH', icao: 'KLCH', name: 'Lake Charles', state: 'LA', lat: 30.125, lon: -93.216, elevationM: 41, wfo: 'LCH', county: 'Calcasieu' },
  GRK: { id: 'GRK', icao: 'KGRK', name: 'Central Texas', state: 'TX', lat: 30.722, lon: -97.383, elevationM: 183, wfo: 'EWX', county: 'Williamson' },
};

// NWS forecast offices responsible for these radars.
export const WFO_NAMES = {
  OUN: 'Norman, OK',
  TSA: 'Tulsa, OK',
  FWD: 'Fort Worth, TX',
  HGX: 'Houston/Galveston, TX',
  ICT: 'Wichita, KS',
  LCH: 'Lake Charles, LA',
  EWX: 'Austin/San Antonio, TX',
};

const STATE_NAMES = { OK: 'Oklahoma', TX: 'Texas', AR: 'Arkansas', KS: 'Kansas', LA: 'Louisiana' };
export const stateName = (s) => STATE_NAMES[s] || s;

// City reference points (city center coordinates).
export const CITIES = [
  { slug: 'oklahoma-city', name: 'Oklahoma City', state: 'OK', lat: 35.4676, lon: -97.5164, primary: 'TLX' },
  { slug: 'tulsa', name: 'Tulsa', state: 'OK', lat: 36.154, lon: -95.9928, primary: 'INX' },
  { slug: 'dallas', name: 'Dallas', state: 'TX', lat: 32.7767, lon: -96.797, primary: 'FWS' },
  { slug: 'houston', name: 'Houston', state: 'TX', lat: 29.7604, lon: -95.3698, primary: 'HGX' },
];

// Stations with their own page (others are listed on city pages only).
export const STATION_PAGES = ['TLX', 'INX'];

// Ground range used for coverage lists: the reach of the dual-polarization
// Level III products.
export const COVERAGE_KM = 230;

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export const compass = (deg) => COMPASS[Math.round(deg / 22.5) % 16];

// How a radar sees a point: distance, direction of the radar from the point,
// and the height of the lowest (0.5°) beam over it, above the radar's elevation.
export function radarGeometry(radar, lat, lon) {
  const fromPoint = groundDistAz(lat, lon, radar.lat, radar.lon);
  const beamFt = beamHeightKm(slantRangeKm(fromPoint.km, 0.5), 0.5) * 3280.84;
  return { km: fromPoint.km, mi: fromPoint.km * 0.621371, bearing: fromPoint.az, beamFt };
}

export function radarsCovering(lat, lon) {
  return Object.values(RADARS)
    .map((r) => ({ radar: r, ...radarGeometry(r, lat, lon) }))
    .filter((x) => x.km <= COVERAGE_KM)
    .sort((a, b) => a.km - b.km);
}

export function citiesNear(radar) {
  return CITIES.map((c) => ({ city: c, ...radarGeometry(radar, c.lat, c.lon) }))
    .filter((x) => x.km <= COVERAGE_KM)
    .sort((a, b) => a.km - b.km);
}

export const fmt = (n, d = 0) => n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
