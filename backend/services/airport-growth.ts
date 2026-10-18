import type { Observation } from '../domain/growth.ts';
import type { AirportRepository, AirportData } from '../data/airport-repository.ts';
import { calculateGrowth } from '../domain/growth.ts';

export class DataError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message); this.status = status; this.code = code;
  }
}

export function getAirportGrowth(repository: AirportRepository, code: string) {
  const iata = validateAirportCode(code);
  const airport = repository.findByIata(iata) ?? missingAirport(iata);
  const observations = completeObservations(airport);
  const growth = calculateGrowth(observations[0], observations[1]);
  return growthResponse(repository, iata, airport, observations, growth);
}

function growthResponse(repository: AirportRepository, iata: string, airport: AirportData, observations: Observation[], growth: ReturnType<typeof calculateGrowth>) {
  return {
    iata, metric: 'passenger_enplanements', periodBasis: 'calendar-year',
    observations: observations.map(row => ({ ...row, evidenceType: 'reported' })),
    yearOverYear: growthDetails(observations, growth),
    sources: airport.sources, dataSnapshot: repository.provenance
  };
}

function growthDetails(observations: Observation[], growth: ReturnType<typeof calculateGrowth>) {
  return {
      fromYear: observations[0].year, toYear: observations[1].year,
      change: growth?.change ?? observations[1].enplanements! - observations[0].enplanements!,
      growthPercent: growth?.growthPercent ?? null, evidenceType: 'calculated', formula: '(current - previous) / previous * 100',
      unavailableReason: growth ? null : 'Previous-year count is zero; percentage growth is undefined.'
    };
}

export function validateAirportCode(code: string) {
  const iata = code.toUpperCase();
  if (!/^[A-Z]{3}$/.test(iata)) {
    throw new DataError(400, 'INVALID_AIRPORT_CODE', 'Airport code must contain exactly three ASCII letters.');
  }
  return iata;
}

function missingAirport(iata: string): never {
  throw new DataError(404, 'AIRPORT_DATA_NOT_FOUND', `No data is available for ${iata} in this snapshot.`);
}
function completeObservations(airport: AirportData) {
  const observations = [...airport.observations].sort((a, b) => a.year - b.year);
  if (observations.length !== 2 || observations.some(row => row.enplanements === null)) {
    throw new DataError(422, 'INSUFFICIENT_DATA', 'Two annual passenger counts are required; missing values are not estimated.');
  }
  return observations;
}
