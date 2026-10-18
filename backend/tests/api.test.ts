import assert from 'node:assert/strict';
import test from 'node:test';
import { request } from './request.ts';
import { createApp } from '../app.ts';
import { loadAirportRepository } from '../data/airport-repository.ts';

test('growth API serves snapshot data, provenance, and meaningful errors through Express routing', async () => {
  const repository = loadAirportRepository();
  const app = createApp(repository);
  for (const [iata, previous, current, growth] of [
    ['LAX', 37760834, 36497303, -3.35],
    ['SFO', 25078968, 26251850, 4.68],
    ['BOS', 21090721, 21021153, -0.33],
  ] as const) {
    const response = await request(app, `/api/airports/${iata}/growth`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.observations.map((row: { year: number; enplanements: number }) => [row.year, row.enplanements]), [[2024, previous], [2025, current]]);
    assert.equal(Number(body.yearOverYear.growthPercent.toFixed(2)), growth);
    assert.equal(body.sources.length, 2);
    assert.deepEqual(body.sources.map((source: { reportingYear: number }) => source.reportingYear), [2024, 2025]);
    assert.ok(body.sources.every((source: { url: string }) => new URL(source.url).hostname === 'www.faa.gov'));
    assert.ok(['documented-local-snapshot', 'official-pdf-download'].includes(body.dataSnapshot.mode));
    assert.ok(body.dataSnapshot.limitations.length > 0);
  }
  assert.equal((await (await request(app, '/api/airports/lax/growth')).json()).iata, 'LAX');
  for (const code of ['LA', 'LAXX', '123', 'L1X', '%20LA']) {
    const response = await request(app, `/api/airports/${code}/growth`);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'INVALID_AIRPORT_CODE');
  }
  const unavailable = await request(app, '/api/airports/JFK/growth');
  assert.equal(unavailable.status, 404);
  assert.equal((await unavailable.json()).error.code, 'AIRPORT_DATA_NOT_FOUND');
});

test('API rejects partial observations without imputation', async () => {
  const repository = loadAirportRepository();
  const airport = repository.findByIata('LAX')!;
  const app = createApp({ ...repository, findByIata: () => ({ ...airport, observations: [{ year: 2024, enplanements: null }, { year: 2025, enplanements: 36497303 }] }) });
  const response = await request(app, '/api/airports/LAX/growth');
  assert.equal(response.status, 422);
  assert.equal((await response.json()).error.code, 'INSUFFICIENT_DATA');
});
