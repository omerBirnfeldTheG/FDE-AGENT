import type { AirportRepository, AirportData } from '../data/airport-repository.ts';
import { calculateGrowth } from '../domain/growth.ts';
import { demandGrowthMethodology, rankDemandGrowth } from '../domain/scoring.ts';

const methodology = {
  ...demandGrowthMethodology,
  growthFormula: '(currentEnplanements - previousEnplanements) / previousEnplanements * 100',
  rankingRule: 'Descending unrounded score; tied scores ordered by ascending IATA code. Rank is an ordinal position.',
  evidenceType: 'assumption'
};

function unavailableReason(airport: AirportData, growth: ReturnType<typeof calculateGrowth>) {
  if (growth) return null;
  const missing = airport.observations.length !== 2 || airport.observations.some(row => row.enplanements === null);
  return missing ? 'Two annual counts are not available; no values are estimated.' : 'Previous-year count is zero; percentage growth is undefined.';
}

function yearOverYear(airport: AirportData, observations: AirportData['observations']) {
  const complete = observations.length === 2;
  const growth = complete ? calculateGrowth(observations[0], observations[1]) : null;
  return { fromYear: complete ? observations[0].year : null, toYear: complete ? observations[1].year : null,
    change: growth?.change ?? null, growthPercent: growth?.growthPercent ?? null,
    evidenceType: 'calculated', unavailableReason: unavailableReason(airport, growth) };
}

function airportDetails(airport: AirportData) {
  const observations = [...airport.observations].sort((a, b) => a.year - b.year);
  return { observations: observations.map(row => ({ ...row, evidenceType: 'reported' })),
    yearOverYear: yearOverYear(airport, observations), sources: airport.sources };
}

function verifyReportingPeriods(airports: AirportData[]) {
  const periods = airports.filter(airport => airport.observations.length === 2)
    .map(airport => airport.observations.map(row => row.year).sort().join('-'));
  if (new Set(periods).size > 1) throw new Error('Rankings require a common reporting period.');
}

function coverage(repository: AirportRepository, result: ReturnType<typeof rankDemandGrowth>) {
  return { datasetAirportCount: repository.list().length, rankedAirportCount: result.rankings.length,
    unrankedAirportCount: result.unranked.length, verifiedKpis: ['passenger_enplanement_growth'],
    unavailableKpis: ['terminal_capacity', 'congestion', 'financial_returns'],
    limitations: [...repository.provenance.limitations, 'Rankings cover only the validated local dataset, not the United States airport market.', 'Passenger growth alone is not proof of terminal expansion need or financial profitability.'] };
}

function rankingsResponse(repository: AirportRepository, details: Map<string, ReturnType<typeof airportDetails>>, result: ReturnType<typeof rankDemandGrowth>) {
  return { metric: demandGrowthMethodology.name, scoreRange: { min: 0, max: 100 }, periodBasis: 'calendar-year', methodology,
    rankings: result.rankings.map(row => ({ rank: row.rank, iata: row.iata, score: row.score, scoreEvidenceType: 'calculated', ...details.get(row.iata)! })),
    unranked: result.unranked.map(row => ({ rank: null, iata: row.iata, score: null, ...details.get(row.iata)! })),
    coverage: coverage(repository, result), dataSnapshot: repository.provenance };
}

export function getAirportRankings(repository: AirportRepository) {
  const airports = repository.list();
  verifyReportingPeriods(airports);
  const details = new Map(airports.map(airport => [airport.iata, airportDetails(airport)]));
  const result = rankDemandGrowth([...details].map(([iata, detail]) => ({ iata, growthPercent: detail.yearOverYear.growthPercent })));
  return rankingsResponse(repository, details, result);
}
