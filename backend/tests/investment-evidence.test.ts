import test from 'node:test';
import assert from 'node:assert/strict';
import { getInvestmentEvidence } from '../data/investment-evidence.ts';
import { createApp } from '../app.ts';
import { request } from './request.ts';

test('investment evidence preserves provenance and distinguishes budgets from appropriations', () => {
  const result = getInvestmentEvidence('lax');
  assert.equal(result.iata, 'LAX');
  assert.equal(result.facts.find(f => f.metric === 'estimated_project_cost')?.value, 1700000000);
  assert.equal(result.facts.find(f => f.metric === 'approved_appropriation')?.value, 1400000000);
  assert.ok(result.facts.every(f => f.source.url.startsWith('https://') && f.source.locator && f.scope));
  result.facts[0].value = 999;
  assert.equal(getInvestmentEvidence('LAX').facts[0].value, 168);
});
test('missing financial returns and uneven coverage remain unavailable', () => {
  for (const iata of ['LAX', 'SFO', 'BOS']) {
    assert.equal(getInvestmentEvidence(iata).financialReturns.npv, null);
    assert.equal(getInvestmentEvidence(iata).financialReturns.availability, 'unavailable');
  }
  assert.equal(getInvestmentEvidence('BOS').coverage.find(c => c.area === 'congestion')?.availability, 'unavailable');
  assert.equal(getInvestmentEvidence('SFO').facts[0].temporalBasis, 'planned');
});
test('investment API validates airport codes and serializes evidence', async () => {
  const app = createApp();
  assert.equal((await request(app, '/api/airports/SFO/investment-evidence')).status, 200);
  assert.equal((await request(app, '/api/airports/12/investment-evidence')).status, 400);
  assert.equal((await request(app, '/api/airports/JFK/investment-evidence')).status, 404);
});
