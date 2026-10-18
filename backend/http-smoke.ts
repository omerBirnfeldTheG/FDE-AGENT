import assert from 'node:assert/strict';

const base = process.env.API_BASE_URL ?? 'http://127.0.0.1:3000';
for (const [iata, expected] of [['LAX', -3.35], ['SFO', 4.68], ['BOS', -0.33]] as const) {
  const response = await fetch(`${base}/api/airports/${iata}/growth`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(Number(body.yearOverYear.growthPercent.toFixed(2)), expected);
  console.log(`${iata}: HTTP 200, ${body.yearOverYear.growthPercent.toFixed(2)}%`);
}
assert.equal((await fetch(`${base}/api/airports/123/growth`)).status, 400);
assert.equal((await fetch(`${base}/api/airports/JFK/growth`)).status, 404);
const rankings = await fetch(`${base}/api/airports/rankings`);
assert.equal(rankings.status, 200);
const rankingBody = await rankings.json();
assert.equal(rankingBody.metric, 'Demand Growth Score');
assert.deepEqual(rankingBody.rankings.map((row: { iata: string }) => row.iata), ['SFO', 'BOS', 'LAX']);
console.log('Rankings: SFO, BOS, LAX');
console.log('HTTP smoke checks passed.');
