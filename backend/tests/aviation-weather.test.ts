import assert from 'node:assert/strict';
import test from 'node:test';
import { createWeatherLookup, parseNwsObservation, parseWeatherObservation } from '../data/aviation-weather.ts';

const now = Date.parse('2026-10-13T12:00:00Z');
// Synthetic transport fixtures for parser/conversion tests; never production data.
const nws = { properties: { station: 'https://api.weather.gov/stations/KSFO', timestamp: '2026-10-13T11:55:00Z',
  rawMessage: 'KSFO test fixture', windSpeed: { value: 18.52, unitCode: 'wmoUnit:km_h' },
  windGust: { value: null, unitCode: 'wmoUnit:km_h' }, visibility: { value: 16093.44, unitCode: 'wmoUnit:m' } } };

test('NWS observations convert declared units and preserve missing values', () => {
  const result = parseNwsObservation(nws, 'KSFO', now)!;
  assert.ok(Math.abs(result.windSpeedKnots! - 10) < 1e-9);
  assert.ok(Math.abs(Number(result.visibilityStatuteMiles) - 10) < 1e-9);
  assert.equal(result.windGustKnots, null);
  assert.equal(result.flightCategory, null);
  assert.throws(() => parseNwsObservation(nws, 'KLAX', now), /station/);
});

test('NWS fallback is used when the primary API fails and successful results are cached', async () => {
  const urls: string[] = [];
  const lookup = createWeatherLookup((async url => {
    urls.push(String(url));
    return String(url).includes('aviationweather.gov') ? new Response('{}', { status: 503 }) : new Response(JSON.stringify(nws));
  }) as typeof fetch, () => now);
  const result = await lookup('SFO');
  assert.equal(result.availability, 'available');
  assert.equal(result.source.url, 'https://api.weather.gov/stations/KSFO/observations/latest');
  assert.equal(result.freshness, 'live-api');
  assert.equal((await lookup('SFO')).freshness, 'cached');
  assert.equal(urls.length, 2);
});

test('empty primary response also tries the alternate source', async () => {
  const lookup = createWeatherLookup((async url => String(url).includes('aviationweather.gov')
    ? new Response(null, { status: 204 }) : new Response(JSON.stringify(nws))) as typeof fetch, () => now);
  assert.equal((await lookup('SFO')).availability, 'available');
});

test('upstream failure leaves data unavailable without inventing values or repeatedly requesting it', async () => {
  let calls = 0;
  const lookup = createWeatherLookup((async () => { calls++; return new Response('blocked', { status: 403 }); }) as typeof fetch, () => now);
  const result = await lookup('SFO');
  assert.equal(result.observation, null);
  assert.equal(result.availability, 'unavailable');
  await lookup('SFO'); assert.equal(calls, 2);
  await assert.rejects(lookup('12'), /three ASCII/);
  await assert.rejects(lookup('JFK'), /coverage/);
});

test('invalid timestamps, unknown units and wrong schemas fail safely', () => {
  assert.throws(() => parseWeatherObservation({}, 'KSFO', now), /schema/);
  assert.throws(() => parseNwsObservation({ properties: { ...nws.properties, timestamp: 'wrong' } }, 'KSFO', now), /timestamp/);
  assert.equal(parseNwsObservation({ properties: { ...nws.properties, windSpeed: { value: 42, unitCode: 'unknown' } } }, 'KSFO', now)!.windSpeedKnots, null);
});
