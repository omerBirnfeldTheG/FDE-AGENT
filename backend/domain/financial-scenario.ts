export interface FinancialAssumptions {
  capitalCost: number;
  annualIncrementalCashFlow: number;
  discountRate: number;
  operatingYears: number;
  constructionYears: number;
}
const limitations = [
  'All capital is assumed paid at year zero. Cash flows start after construction.',
  'Constant incremental net cash flow; no inflation, tax, debt financing, residual value, or cost overruns.',
  'Cash flows are assumptions, not airport forecasts. Simple payback is undiscounted and null if not achieved within the operating horizon.'
];

function validateAssumptions(input: FinancialAssumptions) {
  const values = [input.capitalCost, input.annualIncrementalCashFlow, input.discountRate, input.operatingYears, input.constructionYears];
  const validMoney = input.capitalCost > 0 && input.annualIncrementalCashFlow >= 0 && input.discountRate >= 0 && input.discountRate <= 1;
  const validYears = Number.isInteger(input.operatingYears) && input.operatingYears >= 1 && input.operatingYears <= 100;
  const validConstruction = Number.isInteger(input.constructionYears) && input.constructionYears >= 0 && input.constructionYears <= 30;
  if (!values.every(Number.isFinite) || !validMoney || !validYears || !validConstruction) throw new Error('Invalid financial assumptions.');
}

function presentValueFactor(input: FinancialAssumptions) {
  const years = Array.from({ length: input.operatingYears }, (_, index) => input.constructionYears + index + 1);
  return years.reduce((sum, year) => sum + 1 / (1 + input.discountRate) ** year, 0);
}

function simplePayback(input: FinancialAssumptions) {
  const years = input.annualIncrementalCashFlow === 0 ? Infinity : input.capitalCost / input.annualIncrementalCashFlow;
  return years <= input.operatingYears ? input.constructionYears + years : null;
}

function scenarioResult(input: FinancialAssumptions, factor: number) {
  return { evidenceType: 'estimated' as const, assumptions: { ...input },
    npv: -input.capitalCost + input.annualIncrementalCashFlow * factor,
    simplePaybackYearsFromInvestment: simplePayback(input), breakEvenAnnualCashFlow: input.capitalCost / factor,
    formula: 'NPV = -capitalCost + sum(annualIncrementalCashFlow / (1 + discountRate)^year)', limitations };
}

export function calculateFinancialScenario(input: FinancialAssumptions) {
  validateAssumptions(input);
  return scenarioResult(input, presentValueFactor(input));
}
