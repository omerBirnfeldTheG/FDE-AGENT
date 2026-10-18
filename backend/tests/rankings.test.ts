import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../app.ts';
import { loadAirportRepository } from '../data/airport-repository.ts';
import { getAirportRankings } from '../services/airport-rankings.ts';
import { request } from './request.ts';

test('rankings endpoint includes verified values, methodology, sources and scope', async () => {
  const response = await request(createApp(), '/api/airports/rankings');
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.metric, 'Demand Growth Score');
  assert.deepEqual(body.rankings.map((row: { iata: string }) => row.iata), ['SFO', 'BOS', 'LAX']);
  const expected = [[25078968, 26251850, 73.38377719529767], [21090721, 21021153, 48.35074391245325], [37760834, 36497303, 33.26929166871685]];
  for (const [index, row] of body.rankings.entries()) {
    assert.deepEqual(row.observations.map((observation: { enplanements: number }) => observation.enplanements), expected[index].slice(0, 2));
    assert.ok(Math.abs(row.score - expected[index][2]) < 1e-10);
    assert.deepEqual(row.sources.map((source: { reportingYear: number }) => source.reportingYear), [2024, 2025]);
    assert.ok(row.sources.every((source: { url: string }) => source.url.startsWith('https://www.faa.gov/')));
  }
  assert.equal(body.methodology.version, '1.0.0');
  assert.equal(body.methodology.lowerBound, -10);
  assert.equal(body.methodology.upperBound, 10);
  assert.equal(body.coverage.rankedAirportCount, 3);
  assert.deepEqual(body.coverage.verifiedKpis, ['passenger_enplanement_growth']);
  assert.ok(body.coverage.limitations.some((text: string) => text.includes('not proof')));
});
test('missing annual counts remain unranked with source context', async () => {
  const repository = loadAirportRepository();
  const response = await request(createApp({ ...repository, list: () => repository.list().map(row => row.iata === 'LAX'
    ? { ...row, observations: [{ year: 2024, enplanements: null }, row.observations[1]] } : row) }), '/api/airports/rankings');
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.coverage.rankedAirportCount, 2);
  assert.equal(body.unranked[0].iata, 'LAX');
  assert.equal(body.unranked[0].score, null);
  assert.ok(body.unranked[0].yearOverYear.unavailableReason);
  assert.equal(body.unranked[0].sources.length, 2);
});
test('empty dataset yields empty rankings', () => {
  const result = getAirportRankings({ ...loadAirportRepository(), list: () => [] });
  assert.deepEqual(result.rankings, []);
  assert.equal(result.coverage.datasetAirportCount, 0);
});
test('different reporting periods cannot silently be ranked together', () => {
  const repository = loadAirportRepository();
  assert.throws(() => getAirportRankings({ ...repository, list: () => repository.list().map(row => row.iata === 'LAX'
    ? { ...row, observations: row.observations.map(observation => ({ ...observation, year: observation.year - 1 })) } : row) }), /common reporting period/);
});
