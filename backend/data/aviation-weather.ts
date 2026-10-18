import { DataError, validateAirportCode } from '../services/airport-growth.ts';
import { getOpenAIFailureDiagnostic } from '../agent/diagnostics.ts';
import { parseWeatherObservation, parseNwsObservation, weatherLimitations } from './weather-parsing.ts';
import type { WeatherResult, WeatherLookup } from './weather-types.ts';
export { parseWeatherObservation, parseNwsObservation } from './weather-parsing.ts';
export type { WeatherResult, WeatherLookup } from './weather-types.ts';
type CachedWeather = { at: number; result: WeatherResult };
type Context = { transport: typeof fetch; clock: () => number; cache: Map<string, CachedWeather>; pending: Map<string, Promise<WeatherResult>> };
type Station = { iata: string; icao: string };
type Provider = { name: string; url: string; documentationUrl: string; accept: string; parse: typeof parseWeatherObservation; limitations: string[] };
const stations: Record<string, string> = { LAX: 'KLAX', SFO: 'KSFO', BOS: 'KBOS' };

function stationFor(code: string): Station {
  const iata = validateAirportCode(code), icao = stations[iata];
  if (!icao) throw new DataError(404, 'AIRPORT_DATA_NOT_FOUND', `Weather data is outside this prototype’s coverage for ${iata}.`);
  return { iata, icao };
}

function providers(icao: string): Provider[] {
  return [
    { name: 'NOAA / National Weather Service Aviation Weather Center', url: `https://aviationweather.gov/api/data/metar?ids=${icao}&format=json`, documentationUrl: 'https://aviationweather.gov/data/api/', accept: 'application/json', parse: parseWeatherObservation, limitations: weatherLimitations },
    { name: 'NOAA / National Weather Service station observations', url: `https://api.weather.gov/stations/${icao}/observations/latest`, documentationUrl: 'https://www.weather.gov/documentation/services-web-api', accept: 'application/geo+json', parse: parseNwsObservation, limitations: [...weatherLimitations, 'NWS wind and visibility values are converted to knots and statute miles using their reported unit codes. NWS does not supply flight category here; it remains unavailable.'] }
  ];
}

function observationAge(result: WeatherResult, now: number) {
  return result.observation ? now - Date.parse(result.observation.observedAt) : null;
}

function cachedResult(cached: CachedWeather | undefined, now: number): WeatherResult | null {
  if (!cached) return null;
  const ttl = cached.result.availability === 'available' && cached.result.freshness !== 'stale-cache' ? 300000 : 30000;
  if (now - cached.at >= ttl) return null;
  const age = observationAge(cached.result, now);
  return { ...cached.result, freshness: cached.result.freshness === 'live-api' ? 'cached' : cached.result.freshness, observationStale: age === null ? null : cached.result.freshness === 'stale-cache' || age > 7200000 };
}

async function fetchObservation(context: Context, station: Station, provider: Provider) {
  const response = await context.transport(provider.url, { signal: AbortSignal.timeout(10000), redirect: 'error', headers: { Accept: provider.accept, 'User-Agent': 'AirportInvestmentIntelligence/0.1 academic-prototype' } });
  if (!response.ok) throw Object.assign(new Error(`Weather API returned HTTP ${response.status}.`), { status: response.status });
  const observation = provider.parse(response.status === 204 ? [] : await response.json(), station.icao, context.clock());
  if (!observation) throw new Error('Weather API returned no recent station observation.');
  return observation;
}

function liveResult(context: Context, station: Station, provider: Provider, observation: NonNullable<WeatherResult['observation']>): WeatherResult {
  return { ...station, metric: 'current_aviation_weather', availability: 'available', observation, freshness: 'live-api',
    observationStale: context.clock() - Date.parse(observation.observedAt) > 7200000,
    source: { name: provider.name, url: provider.url, documentationUrl: provider.documentationUrl, retrievedAt: new Date(context.clock()).toISOString() },
    unavailableReason: null, limitations: provider.limitations };
}

function unavailableResult(station: Station): WeatherResult {
  const provider = providers(station.icao)[0];
  return { ...station, metric: 'current_aviation_weather', availability: 'unavailable', observation: null, freshness: 'unavailable', observationStale: null,
    source: { name: provider.name, url: provider.url, documentationUrl: provider.documentationUrl, retrievedAt: null }, limitations: weatherLimitations,
    unavailableReason: 'Neither the Aviation Weather Center nor the National Weather Service API returned a usable observation. No weather values were estimated.' };
}

function fallbackResult(context: Context, station: Station): WeatherResult {
  const previous = context.cache.get(station.iata)?.result, age = previous ? observationAge(previous, context.clock()) : null;
  if (!previous || age === null || age >= 86400000) return unavailableResult(station);
  return { ...previous, freshness: 'stale-cache', observationStale: true, unavailableReason: 'The aviation API could not be refreshed; this is a previously retrieved observation.' };
}

function logFailure(error: unknown, station: Station, index: number) {
  const provider = index === 0 ? 'aviation-weather-center' : 'national-weather-service';
  console.error(JSON.stringify({ ...getOpenAIFailureDiagnostic(error, provider), event: 'weather_api_failed', iata: station.iata, provider }));
}

async function tryProvider(context: Context, station: Station, provider: Provider, index: number) {
  try { return liveResult(context, station, provider, await fetchObservation(context, station, provider)); }
  catch (error) { logFailure(error, station, index); return null; }
}

async function refreshWeather(context: Context, station: Station) {
  for (const [index, provider] of providers(station.icao).entries()) {
    const result = await tryProvider(context, station, provider, index);
    if (result) return result;
  }
  return fallbackResult(context, station);
}

async function saveRefresh(context: Context, station: Station) {
  try {
    const result = await refreshWeather(context, station);
    context.cache.set(station.iata, { at: context.clock(), result });
    return result;
  } finally { context.pending.delete(station.iata); }
}

function lookupWeather(context: Context, code: string): Promise<WeatherResult> {
  const station = stationFor(code), cached = cachedResult(context.cache.get(station.iata), context.clock());
  if (cached) return Promise.resolve(cached);
  const active = context.pending.get(station.iata) ?? saveRefresh(context, station);
  context.pending.set(station.iata, active);
  return active;
}

export function createWeatherLookup(transport: typeof fetch = fetch, clock: () => number = Date.now): WeatherLookup {
  const context: Context = { transport, clock, cache: new Map(), pending: new Map() };
  return async code => lookupWeather(context, code);
}
