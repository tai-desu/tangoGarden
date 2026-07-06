/**
 * weather.js
 * ----------
 * Live Tokyo weather for the garden, via Open-Meteo
 * (free, no API key, sends CORS headers — safe to call from the browser).
 * Result is cached in localStorage for 30 minutes.
 *
 * Kinds: 'sunny' | 'cloudy' | 'rain' | 'snow' | 'wind'
 */

const WEATHER_KEY = 'tango_weather_v1';
const WEATHER_TTL_MS = 30 * 60 * 1000;
const WEATHER_URL =
  'https://api.open-meteo.com/v1/forecast?latitude=35.6895&longitude=139.6917' +
  '&current=weather_code,wind_speed_10m&timezone=Asia%2FTokyo';

const WEATHER_LABEL = {
  sunny: '晴れ', cloudy: 'くもり', rain: '雨', snow: '雪', wind: '風'
};

function weatherKindFromCode(code, windSpeed) {
  let kind;
  if (code === 0 || code === 1) kind = 'sunny';
  else if (code >= 71 && code <= 77 || code === 85 || code === 86) kind = 'snow';
  else if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) kind = 'rain';
  else kind = 'cloudy';
  // strong wind overrides calm skies (but never hides rain/snow)
  if ((kind === 'sunny' || kind === 'cloudy') && windSpeed >= 9) kind = 'wind';
  return kind;
}

async function fetchTokyoWeather(force = false) {
  // preview/testing hook
  if (typeof window !== 'undefined' && window.WEATHER_OVERRIDE) {
    return window.WEATHER_OVERRIDE;
  }

  if (!force) {
    try {
      const cached = JSON.parse(localStorage.getItem(WEATHER_KEY) || 'null');
      if (cached && Date.now() - cached.ts < WEATHER_TTL_MS) return cached.kind;
    } catch (e) { /* ignore */ }
  }

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(WEATHER_URL, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error('bad status');
    const json = await res.json();
    const kind = weatherKindFromCode(
      json.current.weather_code,
      json.current.wind_speed_10m
    );
    try {
      localStorage.setItem(WEATHER_KEY, JSON.stringify({ ts: Date.now(), kind }));
    } catch (e) { /* ignore */ }
    return kind;
  } catch (e) {
    return 'sunny'; // graceful default: the garden always renders
  }
}
