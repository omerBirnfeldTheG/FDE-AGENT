import type { AirportRepository } from '../data/airport-repository.ts';
import { getInvestmentEvidence } from '../data/investment-evidence.ts';
import { getAirportGrowth } from './airport-growth.ts';
import { calculateFinancialScenario } from '../domain/financial-scenario.ts';
type Evidence = ReturnType<typeof getInvestmentEvidence>;
const scenarioMethodology = {
  discountRate: 0.08, operatingYears: 30, constructionYears: 3, evidenceType: 'assumed',
  note: 'Same illustrative parameters across projects; reported costs differ in scope and date. Scenarios are not airport investment rankings.'
};
const rationale = [
  'Positive growth increases demand-screening priority; declining growth weakens that signal.',
  'Documented infrastructure and runway constraints have different causes; terminal investment requires a terminal-specific capacity case.',
  'Existing modernization projects may already address needs; do not count them as new unserved opportunities.',
  'Comparable terminal utilization and delay rates are missing; no defensible profitability ordering is produced.'
];
const missingInputs = ['Terminal peak-hour utilization', 'Comparable airport delay rate', 'Incremental project capacity', 'Incremental net cash-flow forecast', 'Comparable total expansion project cost'];

function assessDemand(growth: number | null) {
  return growth === null ? 'unavailable' : growth > 0 ? 'growing' : 'flat-or-declining';
}

function assessmentResult(growth: number | null) {
  return { decision: 'due-diligence-required', investmentRank: null, confidence: 'low',
    demandSignal: assessDemand(growth), rationale: [...rationale],
    readiness: { totalRequiredInputs: 6, availableInputs: 1, missingInputs: [...missingInputs] } };
}

function createScenario(budget: Evidence['facts'][number], ratio: number) {
  const capitalCost = budget.value as number;
  return { name: `${ratio * 100}% assumed annual net cash yield on cost`, costSource: budget.source,
    annualCashFlowAssumption: 'Illustrative ratio of project cost, not measured revenue or a forecast.',
    ...calculateFinancialScenario({ capitalCost, annualIncrementalCashFlow: capitalCost * ratio, discountRate: scenarioMethodology.discountRate, operatingYears: scenarioMethodology.operatingYears, constructionYears: scenarioMethodology.constructionYears }) };
}

function financialScenarios(evidence: Evidence) {
  const budget = evidence.facts.find(fact => ['estimated_project_cost', 'announced_project_budget'].includes(fact.metric));
  if (!budget || typeof budget.value !== 'number') return [];
  return [0.03, 0.06, 0.10].map(ratio => createScenario(budget, ratio));
}

export function getInvestmentAssessment(repository: AirportRepository, code: string) {
  const evidence = getInvestmentEvidence(code);
  const growth = getAirportGrowth(repository, code);
  return { ...evidence, growth, assessment: assessmentResult(growth.yearOverYear.growthPercent),
    financialScenarios: financialScenarios(evidence), scenarioMethodology: { ...scenarioMethodology } };
}
