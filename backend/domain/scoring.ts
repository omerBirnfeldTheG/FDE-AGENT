// No I/O, storage types, or Express dependencies belong in this module.
export type KpiMethodology = {
  id: string;
  name: string;
  version: string;
  inputUnit: string;
  normalization: string;
  lowerBound: number;
  upperBound: number;
  assumptions: readonly string[];
};

export const demandGrowthMethodology: Readonly<KpiMethodology> = Object.freeze({
  id: 'demand_growth',
  name: 'Demand Growth Score',
  version: '1.0.0',
  inputUnit: 'year-over-year percentage (5 means 5%, not 0.05)',
  normalization: 'score = min(100, max(0, 100 * (growthPercent + 10) / 20))',
  lowerBound: -10,
  upperBound: 10,
  assumptions: Object.freeze([
    '-10% and +10% are fixed heuristic anchors chosen for this prototype, not FAA benchmarks or validated investment thresholds.',
    'Zero growth maps to 50; this is the scale midpoint, not evidence of opportunity or profitability.',
    'Values below -10% map to 0 and above +10% map to 100; saturation loses distinctions at the extremes.',
    'The score depends only on growth, not the size of the airport or the comparison cohort.',
    'Missing growth is unranked; it is never replaced by zero or an estimated value.',
    'Passenger growth alone proves neither terminal expansion need nor financial profitability.'
  ])
});

// Future KPIs can supply separate normalizers; no composite score is implied.
export interface KpiScorer {
  methodology: Readonly<KpiMethodology>;
  score(value: number | null): number | null;
}

export function scoreDemandGrowth(growthPercent: number | null): number | null {
  if (growthPercent === null) return null;
  if (!Number.isFinite(growthPercent)) throw new Error('Growth must be finite or null.');
  const { lowerBound, upperBound } = demandGrowthMethodology;
  return Math.min(100, Math.max(0, 100 * (growthPercent - lowerBound) / (upperBound - lowerBound)));
}

export const demandGrowthScorer: KpiScorer = {
  methodology: demandGrowthMethodology,
  score: scoreDemandGrowth
};

export function rankDemandGrowth(inputs: readonly { iata: string; growthPercent: number | null }[]) {
  const scored = scoreInputs(inputs);
  const ranked = sortScores(scored);
  return {
    rankings: ranked.map((row, index) => ({ ...row, rank: index + 1 })),
    unranked: scored.filter(row => row.score === null)
  };
}

function scoreInputs(inputs: readonly { iata: string; growthPercent: number | null }[]) {
  const seen = new Set<string>();
  return inputs.map(input => scoreInput(input, seen));
}
function scoreInput(input: { iata: string; growthPercent: number | null }, seen: Set<string>) {
    if (!/^[A-Z]{3}$/.test(input.iata) || seen.has(input.iata)) throw new Error('Invalid or duplicate airport code.');
    seen.add(input.iata);
    return { ...input, score: demandGrowthScorer.score(input.growthPercent) };
}
function sortScores(scored: ReturnType<typeof scoreInputs>) {
  return scored.filter((row): row is typeof row & { score: number } => row.score !== null)
    .sort((a, b) => b.score - a.score || (a.iata < b.iata ? -1 : a.iata > b.iata ? 1 : 0));
}
