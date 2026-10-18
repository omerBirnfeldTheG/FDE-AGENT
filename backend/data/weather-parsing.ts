import type { WeatherResult } from './weather-types.ts';
export const weatherLimitations = [
  'METAR is a recent airport weather observation, not a measurement of congestion or terminal capacity.',
  'Weather can affect operations, but this observation cannot establish the cause of a flight delay.',
  'Current weather is not comparable to annual passenger growth and is excluded from the Demand Growth Score.',
  'Missing fields remain unavailable. Reports older than two hours are explicitly labeled stale.',
  'Weather coverage in this prototype is limited to KLAX, KSFO and KBOS.'
];

type Observation = NonNullable<WeatherResult['observation']>;
const windFactors = { 'wmoUnit:km_h': 1 / 1.852, 'wmoUnit:m_s-1': 1 / 0.5144444444444445, 'wmoUnit:kn': 1 };
const visibilityFactors = { 'wmoUnit:m': 1 / 1609.344, 'wmoUnit:mi': 1 };

function nonnegative(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function visibility(value: unknown) {
  if (typeof value === 'number') return nonnegative(value);
  return typeof value === 'string' && /^\d+(?:\.\d+)?\+?$/.test(value) ? value : null;
}

function validateAwcRow(row: any, icao: string, now: number) {
  const validTime = Number.isFinite(row.obsTime) && row.obsTime > 0 && row.obsTime * 1000 <= now + 300000;
  if (!validTime || typeof row.rawOb !== 'string' || !row.rawOb.startsWith(icao)) throw new Error('Invalid aviation weather observation.');
}

function awcObservation(row: any): Observation {
  return { observedAt: new Date(row.obsTime * 1000).toISOString(), rawMetar: row.rawOb,
    windSpeedKnots: nonnegative(row.wspd), windGustKnots: nonnegative(row.wgst), visibilityStatuteMiles: visibility(row.visib),
    flightCategory: ['VFR', 'MVFR', 'IFR', 'LIFR'].includes(row.fltCat) ? row.fltCat : null,
    evidenceType: 'reported', categoryEvidenceType: 'provider-derived' };
}

export function parseWeatherObservation(payload: unknown, icao: string, now: number): Observation | null {
  if (!Array.isArray(payload)) throw new Error('Unexpected aviation API schema.');
  const row = payload.filter(row => row && typeof row === 'object' && row.icaoId === icao).sort((a, b) => Number(b.obsTime) - Number(a.obsTime))[0];
  if (!row) return null;
  validateAwcRow(row, icao, now);
  return awcObservation(row);
}

function stationProperties(payload: unknown, icao: string) {
  const properties = (payload as { properties?: Record<string, any> } | null)?.properties;
  if (!properties) throw new Error('Unexpected NWS observation schema.');
  if (properties.stationId !== icao && properties.station !== `https://api.weather.gov/stations/${icao}`) throw new Error('NWS station does not match requested airport.');
  return properties;
}

function quantity(item: any, factors: Record<string, number>) {
  const value = nonnegative(item?.value), factor = factors[item?.unitCode];
  return value !== null && factor !== undefined ? value * factor : null;
}

function nwsObservation(properties: Record<string, any>, observed: number): Observation {
  return { observedAt: new Date(observed).toISOString(), rawMetar: typeof properties.rawMessage === 'string' ? properties.rawMessage : 'Raw METAR unavailable.',
    windSpeedKnots: quantity(properties.windSpeed, windFactors), windGustKnots: quantity(properties.windGust, windFactors),
    visibilityStatuteMiles: quantity(properties.visibility, visibilityFactors),
    flightCategory: null, evidenceType: 'reported', categoryEvidenceType: 'provider-derived' };
}

export function parseNwsObservation(payload: unknown, icao: string, now: number): Observation | null {
  const properties = stationProperties(payload, icao);
  if (!properties.timestamp) return null;
  const observed = Date.parse(properties.timestamp);
  if (!Number.isFinite(observed) || observed > now + 300000) throw new Error('Invalid NWS observation timestamp.');
  return nwsObservation(properties, observed);
}
