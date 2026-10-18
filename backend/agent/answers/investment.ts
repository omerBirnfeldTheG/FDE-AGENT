import type { getInvestmentAssessment } from '../../services/investment-assessment.ts';
type Assessment = ReturnType<typeof getInvestmentAssessment>;
type Fact = Assessment['facts'][number];
type Scenario = Assessment['financialScenarios'][number];

function describeFact(fact: Fact) {
  const reference = `${fact.source.url} (${fact.source.locator})`;
  return `${fact.metric}: ${fact.value} ${fact.unit}. Scope: ${fact.scope}. ${fact.temporalBasis}. ${fact.source.reportingPeriod}. Source: ${reference}. ${fact.limitations.join(' ')}`;
}

function describeScenario(scenario: Scenario) {
  const money = (amount: number) => Math.round(amount).toLocaleString('en-US');
  const result = `NPV $${money(scenario.npv)}; simple payback ${scenario.simplePaybackYearsFromInvestment ?? 'not reached'} years from investment.`;
  const assumptions = describeAssumptions(scenario);
  return `ESTIMATED scenario: ${scenario.name}; ${result} ${assumptions} Break-even annual net cash flow: $${money(scenario.breakEvenAnnualCashFlow)}.`;
}

export function describeInvestment(data: Assessment) {
  return [
    `${data.iata}: due diligence required; confidence low. No profitability rank is established.`,
    ...data.facts.map(describeFact), ...data.financialScenarios.map(describeScenario),
    data.financialReturns.reason, ...data.assessment.rationale, ...data.limitations
  ];
}

function describeAssumptions(scenario: Scenario) {
  const input = scenario.assumptions;
  return `ASSUMED discount rate ${input.discountRate * 100}%, ${input.operatingYears} operating years, ${input.constructionYears} construction years, all capital paid at year zero. Cash flow is assumed, not a forecast.`;
}
