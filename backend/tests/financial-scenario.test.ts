import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateFinancialScenario } from '../domain/financial-scenario.ts';
import { getInvestmentAssessment } from '../services/investment-assessment.ts';
import { loadAirportRepository } from '../data/airport-repository.ts';
import { executeTool } from '../agent/tools.ts';
const base = { capitalCost: 100, annualIncrementalCashFlow: 10, discountRate: 0, operatingYears: 20, constructionYears: 3 };
test('finance validates cash-flow timing and zero-rate NPV', () => {
  const result = calculateFinancialScenario(base);
  assert.equal(result.npv, 100); assert.equal(result.simplePaybackYearsFromInvestment, 13);
  assert.equal(result.breakEvenAnnualCashFlow, 5);
  assert.ok(calculateFinancialScenario({ ...base, discountRate: 0.1 }).npv < result.npv);
});
test('finance handles no return, insufficient horizon, invalid values', () => {
  assert.equal(calculateFinancialScenario({ ...base, annualIncrementalCashFlow: 0 }).npv, -100);
  assert.equal(calculateFinancialScenario({ ...base, operatingYears: 2 }).simplePaybackYearsFromInvestment, null);
  for (const input of [{ ...base, capitalCost: -1 }, { ...base, discountRate: NaN }, { ...base, operatingYears: 2.5 }]) assert.throws(() => calculateFinancialScenario(input));
});
test('assessment keeps estimated scenarios separate from verified financial returns', () => {
  const repo = loadAirportRepository();
  const result = getInvestmentAssessment(repo, 'SFO');
  assert.equal(result.financialScenarios.length, 3);
  assert.equal(result.financialReturns.npv, null);
  assert.equal(result.assessment.investmentRank, null);
  assert.equal(getInvestmentAssessment(repo, 'BOS').financialScenarios.length, 0);
  assert.equal(executeTool(repo, 'get_investment_assessment', '{"iata":"SFO"}').kind, 'investment');
  assert.equal(executeTool(repo, 'get_investment_assessment', '{"iata":"JFK"}').kind, 'error');
});

test('missing financial assumption is rejected even from untyped runtime input', () => {
  const incomplete = { capitalCost: 100, discountRate: 0.08, operatingYears: 20, constructionYears: 3 };
  assert.throws(() => calculateFinancialScenario(incomplete as Parameters<typeof calculateFinancialScenario>[0]), /Invalid financial assumptions/);
});
