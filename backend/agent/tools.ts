import { getInvestmentAssessment } from '../services/investment-assessment.ts';
import type { AirportRepository } from '../data/airport-repository.ts';
import { DataError, getAirportGrowth } from '../services/airport-growth.ts';
import { getAirportRankings } from '../services/airport-rankings.ts';
import type { WeatherLookup, WeatherResult } from '../data/aviation-weather.ts';

export const tools = [
  { type: 'function', name: 'get_investment_assessment', strict: true,
    description: 'Get sourced terminal infrastructure, constraints, project costs, evidence gaps and illustrative assumed financial scenarios. Not a profitability ranking. Covers LAX, SFO, BOS.',
    parameters: { type: 'object', properties: { iata: { type: 'string' } }, required: ['iata'], additionalProperties: false } },
  {
    type: 'function', name: 'get_airport_weather', strict: true,
    description: 'Call the public NOAA aviation API for recent airport METAR weather observations. Operational weather context only: never congestion, terminal capacity or investment profitability. Covers LAX, SFO, BOS.',
    parameters: { type: 'object', properties: { iata: { type: 'string' } }, required: ['iata'], additionalProperties: false }
  },
  {
    type: 'function', name: 'get_airport_growth', strict: true,
    description: 'Retrieve verified calendar-year passenger enplanements and growth for an IATA code. Current dataset: LAX, SFO, BOS only. Missing data returns an error, never an estimate.',
    parameters: { type: 'object', properties: { iata: { type: 'string', description: 'Three-letter airport code, e.g. SFO.' } }, required: ['iata'], additionalProperties: false }
  },
  {
    type: 'function', name: 'get_demand_growth_rankings', strict: true,
    description: 'Retrieve deterministic Demand Growth Score rankings, inputs, methodology, and limitations for the validated dataset. Does not establish expansion need or profitability.',
    parameters: { type: 'object', properties: {}, required: [], additionalProperties: false }
  }
];

export type ToolResult =
  | { kind: 'investment'; data: ReturnType<typeof getInvestmentAssessment> }
  | { kind: 'weather'; data: WeatherResult }
  | { kind: 'growth'; data: ReturnType<typeof getAirportGrowth> }
  | { kind: 'rankings'; data: ReturnType<typeof getAirportRankings> }
  | { kind: 'error'; error: { code: string; message: string } };

function parseArguments(raw: string, expectsAirport: boolean) {
  const args = JSON.parse(raw);
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Arguments must be an object.');
  const keys = Object.keys(args);
  if (expectsAirport ? keys.length !== 1 || typeof args.iata !== 'string' : keys.length !== 0) throw new Error('Invalid tool arguments.');
  return args as { iata: string };
}

function toolFailure(error: unknown): ToolResult {
  const details = error instanceof DataError ? { code: error.code, message: error.message }
    : { code: 'TOOL_ERROR', message: 'Tool arguments or underlying data could not be validated.' };
  return { kind: 'error', error: details };
}

function lookupData(repository: AirportRepository, name: string, raw: string): ToolResult {
  const args = parseArguments(raw, name !== 'get_demand_growth_rankings');
  if (name === 'get_airport_growth') return { kind: 'growth', data: getAirportGrowth(repository, args.iata) };
  if (name === 'get_investment_assessment') return { kind: 'investment', data: getInvestmentAssessment(repository, args.iata) };
  if (name === 'get_demand_growth_rankings') return { kind: 'rankings', data: getAirportRankings(repository) };
  return { kind: 'error', error: { code: 'UNKNOWN_TOOL', message: 'Requested tool is not supported.' } };
}

export function executeTool(repository: AirportRepository, name: string, rawArguments: string): ToolResult {
  try { return lookupData(repository, name, rawArguments); }
  catch (error) { return toolFailure(error); }
}

export async function executeAgentTool(repository: AirportRepository, name: string, rawArguments: string, weather: WeatherLookup): Promise<ToolResult> {
  if (name !== 'get_airport_weather') return executeTool(repository, name, rawArguments);
  try { return { kind: 'weather', data: await weather(parseArguments(rawArguments, true).iata) }; }
  catch (error) { return toolFailure(error); }
}
