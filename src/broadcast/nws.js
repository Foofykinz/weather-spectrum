// Current conditions and the 5-day forecast for a city, straight from the
// National Weather Service API (api.weather.gov). Nothing is estimated: if a
// value is missing from the observation, it's shown as missing.

const API = 'https://api.weather.gov';
const OBS_TTL = 10 * 60e3;
const FORECAST_TTL = 30 * 60e3;
const points = new Map(); // "lat,lon" -> Promise<point>
const cache = new Map(); // url -> { at, promise }

async function getJson(url, signal) {
  const r = await fetch(url, { signal, headers: { Accept: 'application/geo+json' } });
  if (!r.ok) throw new Error(`NWS ${r.status}`);
  return r.json();
}

function cached(url, ttl, signal) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < ttl) return hit.promise;
  const promise = getJson(url, signal).catch((err) => {
    cache.delete(url);
    throw err;
  });
  cache.set(url, { at: Date.now(), promise });
  return promise;
}

function point(city, signal) {
  const key = `${city.lat.toFixed(4)},${city.lon.toFixed(4)}`;
  if (!points.has(key)) {
    points.set(
      key,
      getJson(`${API}/points/${key}`, signal)
        .then((j) => j.properties)
        .catch((err) => {
          points.delete(key);
          throw err;
        })
    );
  }
  return points.get(key);
}

const cToF = (c) => (c == null ? null : Math.round((c * 9) / 5 + 32));
const kmhToMph = (k) => (k == null ? null : Math.round(k / 1.609344));
const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const compass = (deg) => (deg == null ? null : COMPASS[Math.round(deg / 22.5) % 16]);

function observation(p) {
  const v = (x) => x?.value ?? null;
  const temp = cToF(v(p.temperature));
  const feels = cToF(v(p.heatIndex) ?? v(p.windChill));
  return {
    time: new Date(p.timestamp),
    text: p.textDescription || null,
    temp,
    feels: feels != null && feels !== temp ? feels : null,
    dew: cToF(v(p.dewpoint)),
    humidity: v(p.relativeHumidity) == null ? null : Math.round(v(p.relativeHumidity)),
    wind: kmhToMph(v(p.windSpeed)),
    gust: kmhToMph(v(p.windGust)),
    windDir: compass(v(p.windDirection)),
    pressure: v(p.barometricPressure) == null ? null : (v(p.barometricPressure) / 3386.389).toFixed(2),
    visibility: v(p.visibility) == null ? null : Math.round(v(p.visibility) / 1609.344),
  };
}

// Day/night periods -> up to 5 cards: { name, hi, lo, text, pop, day }
function fiveDay(periods, tz) {
  const cards = [];
  let i = 0;
  if (periods[0] && !periods[0].isDaytime) {
    cards.push({ name: 'Tonight', hi: null, lo: periods[0].temperature, text: periods[0].shortForecast, pop: periods[0].probabilityOfPrecipitation?.value ?? null, day: false });
    i = 1;
  }
  for (; i < periods.length && cards.length < 5; i++) {
    const d = periods[i];
    if (!d.isDaytime) continue;
    const n = periods[i + 1] && !periods[i + 1].isDaytime ? periods[i + 1] : null;
    const pops = [d, n].map((x) => x?.probabilityOfPrecipitation?.value).filter((x) => x != null);
    cards.push({
      name: cards.length === 0 ? 'Today' : new Date(d.startTime).toLocaleDateString('en-US', { weekday: 'short', timeZone: tz }),
      hi: d.temperature,
      lo: n ? n.temperature : null,
      text: d.shortForecast,
      pop: pops.length ? Math.max(...pops) : null,
      day: true,
    });
  }
  return cards;
}

// -> { tz, place, obs, days, updated } ; obs or days may be null if that part failed.
export async function cityWeather(city, signal) {
  const p = await point(city, signal);
  const [obs, fc] = await Promise.all([
    cached(p.observationStations, 24 * 3600e3, signal)
      .then((s) => s.features?.[0]?.properties?.stationIdentifier)
      .then((id) => (id ? cached(`${API}/stations/${id}/observations/latest`, OBS_TTL, signal) : null))
      .then((j) => (j ? { ...observation(j.properties), station: j.properties.station?.split('/').pop() } : null))
      .catch(() => null),
    cached(p.forecast, FORECAST_TTL, signal)
      .then((j) => ({ days: fiveDay(j.properties.periods || [], p.timeZone), updated: new Date(j.properties.updateTime || j.properties.generatedAt) }))
      .catch(() => null),
  ]);
  return { tz: p.timeZone, office: p.gridId, obs, days: fc?.days || null, updated: fc?.updated || null };
}
