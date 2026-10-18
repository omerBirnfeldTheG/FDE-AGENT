import { calculateGrowth } from '../backend/domain/growth.ts';
import { readFileSync, writeFileSync } from 'node:fs';

type Source = {
  year: number;
  url: string;
  publicationDate: string;
  title: string;
  pages: number[];
  columnOrder: string;
  text: string;
};

const input = JSON.parse(readFileSync(new URL('./faa-extracts.json', import.meta.url), 'utf8')) as {
  captureDate: string;
  captureMethod: string;
  sources: Source[];
};
const sources = [...input.sources].sort((a, b) => a.year - b.year);
if (sources.length !== 2 || sources[1].year !== sources[0].year + 1) {
  throw new Error('Exactly two consecutive source years are required.');
}

function sourceRow(source: Source, airport: string) {
  const rows = source.text.split('\n').filter(row => row.split(/\s+/).includes(airport));
  if (rows.length !== 1) throw new Error(`Expected one ${airport} row in ${source.year}.`);
  const match = rows[0].match(/\bP\s+L\s+([\d,]+)\s+([\d,]+)\s+(-?\d+\.\d+)%\s*$/);
  if (!match) throw new Error(`Unexpected row layout: ${rows[0]}`);
  return match;
}

function verifyPublishedGrowth(source: Source, airport: string, current: number, previous: number, published: number) {
  if (![current, previous].every(n => Number.isSafeInteger(n) && n > 0)) throw new Error('Enplanements must be positive safe integers.');
  const growth = calculateGrowth({ year: source.year - 1, enplanements: previous }, { year: source.year, enplanements: current })!;
  if (Math.abs(growth.growthPercent - published) > 0.0050001) throw new Error(`FAA percentage does not reconcile for ${airport}, ${source.year}.`);
}

function extract(source: Source, airport: string) {
  const match = sourceRow(source, airport);
  const current = Number(match[1].replaceAll(',', '')), previous = Number(match[2].replaceAll(',', ''));
  const publishedGrowth = Number(match[3]);
  verifyPublishedGrowth(source, airport, current, previous, publishedGrowth);
  return { current, previous, publishedGrowth };
}

function airportResult(airport: string, earlier: ReturnType<typeof extract>, later: ReturnType<typeof extract>) {
  const growth = calculateGrowth({ year: sources[0].year, enplanements: earlier.current }, { year: sources[1].year, enplanements: later.current })!;
  return { airport, previousYear: sources[0].year, previousEnplanements: earlier.current,
    currentYear: sources[1].year, currentEnplanements: later.current, change: growth.change, growthPercent: growth.growthPercent,
    faaPublishedGrowthPercent: later.publishedGrowth, overlappingYearMatches: true, sourceUrls: sources.map(source => source.url) };
}

function validateAirport(airport: string) {
  const earlier = extract(sources[0], airport), later = extract(sources[1], airport);
  if (earlier.current !== later.previous) throw new Error(`${airport}: overlapping year differs across publications.`);
  return airportResult(airport, earlier, later);
}

const results = ['LAX', 'SFO', 'BOS'].map(validateAirport);

console.table(results.map(({ sourceUrls, ...row }) => row));
writeFileSync(new URL('./results.json', import.meta.url), JSON.stringify({
  captureDate: input.captureDate,
  captureMethod: input.captureMethod,
  formula: '(currentEnplanements - previousEnplanements) / previousEnplanements * 100',
  results,
}, null, 2) + '\n');
