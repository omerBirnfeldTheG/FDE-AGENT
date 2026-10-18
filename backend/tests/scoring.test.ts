import assert from 'node:assert/strict';
import test from 'node:test';
import { rankDemandGrowth, scoreDemandGrowth } from '../domain/scoring.ts';

test('positive growth maps linearly to Demand Growth Score', () => {
  assert.equal(scoreDemandGrowth(5), 75);
});
test('negative growth maps linearly to Demand Growth Score', () => {
  assert.equal(scoreDemandGrowth(-5), 25);
});
test('zero growth maps to midpoint, distinct from missing data', () => {
  assert.equal(scoreDemandGrowth(0), 50);
  assert.equal(scoreDemandGrowth(null), null);
});
test('boundaries and extreme values stay within 0 to 100', () => {
  for (const value of [-100, -11, -10]) assert.equal(scoreDemandGrowth(value), 0);
  for (const value of [10, 11, 1000, Number.MAX_VALUE]) assert.equal(scoreDemandGrowth(value), 100);
  assert.ok(scoreDemandGrowth(-9.99)! > 0);
  assert.ok(scoreDemandGrowth(9.99)! < 100);
});
test('rejects nonfinite values rather than silently scoring them', () => {
  for (const value of [NaN, Infinity, -Infinity]) assert.throws(() => scoreDemandGrowth(value));
});
test('rankings are deterministic with missing data, ties and saturation', () => {
  const input = [{ iata: 'SFO', growthPercent: 12 }, { iata: 'LAX', growthPercent: null },
    { iata: 'BOS', growthPercent: 11 }, { iata: 'JFK', growthPercent: 0 }];
  const copy = structuredClone(input);
  const result = rankDemandGrowth(input);
  assert.deepEqual(result.rankings.map(row => [row.iata, row.rank, row.score]), [['BOS', 1, 100], ['SFO', 2, 100], ['JFK', 3, 50]]);
  assert.deepEqual(result.unranked, [{ iata: 'LAX', growthPercent: null, score: null }]);
  assert.deepEqual(input, copy);
  assert.deepEqual(rankDemandGrowth([...input].reverse()).rankings, result.rankings);
  assert.deepEqual(rankDemandGrowth([]), { rankings: [], unranked: [] });
});
test('fixed normalization is independent of cohort', () => {
  assert.equal(rankDemandGrowth([{ iata: 'LAX', growthPercent: 5 }]).rankings[0].score, 75);
  assert.throws(() => rankDemandGrowth([{ iata: 'LAX', growthPercent: 5 }, { iata: 'LAX', growthPercent: 1 }]));
});
