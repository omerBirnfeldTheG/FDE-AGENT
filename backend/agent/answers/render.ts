import type { AirportRepository } from '../../data/airport-repository.ts';
import type { ToolResult } from '../tools.ts';
import { ChatError } from '../chat-error.ts';
import { scope, caveat } from './selection.ts';
import { describeInvestment } from './investment.ts';

type Selection = { view: string; iatas: string[] };
type Growth = Extract<ToolResult, { kind: 'growth' }>['data'];
type Rankings = Extract<ToolResult, { kind: 'rankings' }>['data'];
type Weather = Extract<ToolResult, { kind: 'weather' }>['data'];
const views = ['growth', 'rankings', 'comparison', 'methodology', 'weather', 'investment', 'unavailable'];

function failEvidence(message: string): never {
  throw new ChatError(502, 'MISSING_TOOL_EVIDENCE', message);
}

function validateSelection(selection: unknown): Selection {
  const value = selection as Selection | null;
  const validCodes = Array.isArray(value?.iatas) && value.iatas.every(code => typeof code === 'string' && /^[A-Z]{3}$/.test(code));
  if (!value || !views.includes(value.view) || !validCodes || Object.keys(value).some(key => !['view', 'iatas'].includes(key)))
    throw new ChatError(502, 'INVALID_MODEL_RESPONSE', 'The model returned an invalid answer selection. Please retry.');
  return { view: value.view, iatas: [...new Set(value.iatas)] };
}

function supportedCodes(evidence: ToolResult[]) {
  return evidence.flatMap(item => {
    if (item.kind === 'error') return [];
    return item.kind === 'rankings' ? item.data.rankings.map(row => row.iata) : [item.data.iata];
  });
}

function verifyReferences(selection: Selection, evidence: ToolResult[]) {
  const supported = new Set(supportedCodes(evidence));
  if (selection.view !== 'unavailable' && selection.iatas.some(code => !supported.has(code)))
    throw new ChatError(502, 'UNSUPPORTED_MODEL_REFERENCE', 'The model selected an airport without verified evidence. Please retry.');
}

function evidenceFor<K extends ToolResult['kind']>(evidence: ToolResult[], kind: K) {
  return evidence.filter((item): item is Extract<ToolResult, { kind: K }> => item.kind === kind);
}

function renderInvestment(codes: string[], evidence: ToolResult[]) {
  if (!codes.length) failEvidence('Investment evidence is required.');
  return codes.flatMap(code => {
    const item = evidenceFor(evidence, 'investment').find(item => item.data.iata === code);
    return describeInvestment(item?.data ?? failEvidence('Investment evidence is required.'));
  });
}

function weatherMeasurements(data: Weather) {
  const row = data.observation!;
  return [
    `Reported visibility: ${row.visibilityStatuteMiles ?? 'unavailable'} statute miles. Reported wind: ${row.windSpeedKnots ?? 'unavailable'} knots; gusts: ${row.windGustKnots ?? 'unavailable'} knots. NOAA-derived flight category: ${row.flightCategory ?? 'unavailable'}.`,
    `METAR: ${row.rawMetar}`
  ];
}

function weatherObservation(data: Weather) {
  if (!data.observation) return [`${data.iata}: current aviation weather is unavailable. ${data.unavailableReason ?? ''}`];
  const stale = data.observationStale ? '; stale observation—do not treat as current' : '';
  const heading = `${data.iata} (${data.icao}): observation at ${data.observation.observedAt}. Retrieval: ${data.freshness}${stale}.`;
  return [heading, ...weatherMeasurements(data), ...(data.unavailableReason ? [data.unavailableReason] : [])];
}

function renderWeather(codes: string[], evidence: ToolResult[]) {
  if (!codes.length) failEvidence('Select an airport with aviation weather evidence.');
  return codes.flatMap(code => {
    const data = evidenceFor(evidence, 'weather').find(item => item.data.iata === code)?.data;
    if (!data) failEvidence('Aviation weather evidence is required.');
    return [...weatherObservation(data), `Public aviation API source: ${data.source.url}`, ...data.limitations];
  });
}

function describeGrowth(data: Growth) {
  const counts = data.observations.map(row => `${data.iata}, ${row.year}: ${row.enplanements!.toLocaleString('en-US')} reported passenger boardings.`);
  const growth = data.yearOverYear.growthPercent;
  const explanation = growth === null ? 'Calculated year-over-year percentage growth is unavailable because the previous-year count is zero.' : `Calculated year-over-year growth: ${growth.toFixed(2)}%.`;
  return [...counts, explanation];
}

function renderGrowth(codes: string[], evidence: ToolResult[]) {
  if (!codes.length) failEvidence('Select an airport with verified growth evidence.');
  return codes.flatMap(code => {
    const data = evidenceFor(evidence, 'growth').find(item => item.data.iata === code)?.data;
    return describeGrowth(data ?? failEvidence('Passenger growth tool evidence is required.'));
  });
}

function describeRank(row: Rankings['rankings'][number]) {
  return `${row.iata}: rank ${row.rank}, Demand Growth Score ${row.score.toFixed(2)}/100; ${row.yearOverYear.fromYear}–${row.yearOverYear.toYear} growth ${row.yearOverYear.growthPercent!.toFixed(2)}%.`;
}

function describeComparison(rows: Rankings['rankings'], codes: string[]) {
  const first = rows.find(row => row.iata === codes[0])!;
  const second = rows.find(row => row.iata === codes[1])!;
  const difference = first.yearOverYear.growthPercent! - second.yearOverYear.growthPercent!;
  return `${first.iata} growth minus ${second.iata} growth is ${difference.toFixed(2)} percentage points.`;
}

function explainRanking(data: Rankings) {
  const leader = data.rankings[0];
  const explanation = leader ? [`${leader.iata} ranks first under the passenger-growth-only score. Scores are sorted descending, with IATA code breaking ties. This ranking applies only to the validated dataset.`] : [];
  return [...explanation, 'Methodology: score = clamp(5 × (growthPercent + 10), 0, 100). The −10% and +10% anchors are heuristic assumptions; zero growth scores 50.'];
}

function renderRankings(selection: Selection, evidence: ToolResult[]) {
  const data = evidenceFor(evidence, 'rankings')[0]?.data ?? failEvidence('Ranking evidence is required. Please retry.');
  if (selection.view === 'comparison' && selection.iatas.length < 2) failEvidence('Comparison requires two evidenced airports.');
  const rows = selection.view === 'rankings' || !selection.iatas.length ? data.rankings : data.rankings.filter(row => selection.iatas.includes(row.iata));
  const comparison = selection.view === 'comparison' && selection.iatas.length === 2 ? [describeComparison(rows, selection.iatas)] : [];
  return [...rows.map(describeRank), ...comparison, ...explainRanking(data)];
}

function renderUnavailable(evidence: ToolResult[]) {
  const errors = evidenceFor(evidence, 'error').map(item => item.error.message);
  return errors.length ? errors : ['This request cannot be established from the available evidence. Ask about passenger growth, sourced investment records, illustrative financial scenarios, or weather.'];
}

function renderView(selection: Selection, evidence: ToolResult[]) {
  if (selection.view === 'investment') return renderInvestment(selection.iatas, evidence);
  if (selection.view === 'weather') return renderWeather(selection.iatas, evidence);
  if (selection.view === 'growth') return renderGrowth(selection.iatas, evidence);
  if (selection.view === 'unavailable') return renderUnavailable(evidence);
  return renderRankings(selection, evidence);
}

function sourceLines(evidence: ToolResult[]) {
  const sources = [...evidenceFor(evidence, 'growth').flatMap(item => item.data.sources), ...evidenceFor(evidence, 'rankings').flatMap(item => item.data.rankings.flatMap(row => row.sources ?? []))];
  const unique = new Map(sources.map(source => [source.url, source]));
  return [...unique.values()].map(source => `FAA source, reporting year ${source.reportingYear}: ${source.url}`);
}

function passengerNotes(provenance: AirportRepository['provenance']) {
  const acquisition = provenance.mode === 'official-pdf-download'
    ? 'Data comes from downloaded original FAA PDFs, parsed and validated into a local snapshot. This is not a real-time FAA feed.'
    : 'Data comes from documented local PDF extracts; original FAA files were not downloaded locally.';
  return ['Counts are calendar-year passenger boardings, not total arriving and departing passengers.', acquisition, caveat];
}

export function renderAnswer(value: unknown, evidence: ToolResult[], provenance: AirportRepository['provenance']) {
  const selection = validateSelection(value);
  verifyReferences(selection, evidence);
  const notes = selection.view === 'investment' ? [] : [...passengerNotes(provenance), ...sourceLines(evidence)];
  return [scope, ...renderView(selection, evidence), ...notes].join('\n\n');
}
