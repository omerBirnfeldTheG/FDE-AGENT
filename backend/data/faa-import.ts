import { createHash } from 'node:crypto';
import { calculateGrowth } from '../domain/growth.ts';

export const faaSources = [
  { year: 2024, publicationDate: '2025-09-15', title: 'Cy2024 Enplanements at All Commercial Service Airports (by Rank)', url: 'https://www.faa.gov/sites/faa.gov/files/2026-09/arp-cy2024-commercial-service-enplanements.pdf' },
  { year: 2025, publicationDate: '2026-09-24', title: 'Final CY2025 Enplanements at All Airports by State and Airport', url: 'https://www.faa.gov/airports/planning_capacity/passenger_allcargo_stats/passenger/arp-cy2025-commercial-service-enplanements.pdf' }
] as const;
export const validatedAirports = ['LAX', 'SFO', 'BOS'] as const;
export type ImportedSource = {
  year: number; publicationDate: string; title: string; url: string;
  downloadedAt: string; sha256: string; rawFile: string;
};
export type DownloadedSnapshot = {
  schemaVersion: 1; mode: 'official-pdf-download'; captureDate: string;
  captureMethod: string; sources: ImportedSource[];
  results: { airport: string; previousYear: number; previousEnplanements: number; currentYear: number;
    currentEnplanements: number; sourceUrls: string[]; growthPercent: number; overlappingYearMatches: boolean }[];
};

type Counts = { current: number; previous: number };
type Report = { source: typeof faaSources[number]; file: Awaited<ReturnType<typeof downloadFaaPdf>>; rows: Map<string, Counts> };
const downloadLimit = 10 * 1024 * 1024;

function validateHeaders(flat: string, year: number) {
  const current = new RegExp(`CY\\s*${String(year).slice(2)}\\s+Enplanement`);
  const previous = new RegExp(`CY\\s*${String(year - 1).slice(2)}\\s+Enplanement`);
  if (!flat.includes(`CY${year} ACAIS`) || !current.test(flat) || !previous.test(flat)) throw new Error(`FAA report ${year}: unexpected reporting-year headers.`);
}

function airportTail(flat: string, airport: string, year: number) {
  const identifier = new RegExp(`\\b(?:WP|W\\s+P|NE)\\s+(?:CA|MA)\\s+${airport}\\b`, 'g');
  const matches = [...flat.matchAll(identifier)];
  if (matches.length !== 1) throw new Error(`FAA report ${year}: expected one ${airport} row.`);
  const tail = flat.slice(matches[0].index! + matches[0][0].length);
  const nextRow = tail.search(/\b\d+\s+(?:[A-Z]{2}|W\s+P)\s+[A-Z]{2}\s+[A-Z0-9]{2,4}\b/);
  return nextRow >= 0 ? tail.slice(0, nextRow) : tail;
}

function countMatch(tail: string, airport: string, year: number) {
  const count = '(\\d{1,3}(?:,\\d{3})+|\\d+)';
  const values = tail.match(new RegExp(`\\bP\\s+L\\s+${count}\\s+${count}\\s+(-?\\d+(?:\\.\\d+)?)\\s*%`));
  if (!values) throw new Error(`FAA report ${year}: cannot parse ${airport} counts.`);
  return values;
}

function parseCounts(flat: string, airport: string, year: number): Counts {
  const values = countMatch(airportTail(flat, airport, year), airport, year);
  const current = Number(values[1].replaceAll(',', '')), previous = Number(values[2].replaceAll(',', ''));
  const growth = calculateGrowth({ year: year - 1, enplanements: previous }, { year, enplanements: current });
  if (!growth || Math.abs(growth.growthPercent - Number(values[3])) > 0.0050001) throw new Error(`FAA report ${year}: ${airport} percentage does not reconcile.`);
  return { current, previous };
}

export function parseFaaReport(text: string, year: number) {
  const flat = text.replace(/\s+/g, ' ').trim();
  validateHeaders(flat, year);
  return new Map(validatedAirports.map(airport => [airport, parseCounts(flat, airport, year)]));
}

function validateDownload(response: Response) {
  if (!response.ok) throw new Error(`FAA download failed (HTTP ${response.status}).`);
  if (Number(response.headers.get('content-length')) > downloadLimit) throw new Error('FAA file exceeds download size limit.');
  if (!response.body) throw new Error('FAA download has no body.');
  return response.body.getReader();
}

async function nextChunk(reader: ReadableStreamDefaultReader<Uint8Array>, size: number) {
  const chunk = await reader.read();
  if (!chunk.done && size + chunk.value.byteLength > downloadLimit) {
    await reader.cancel();
    throw new Error('FAA file exceeds download size limit.');
  }
  return chunk;
}

async function readChunks(reader: ReadableStreamDefaultReader<Uint8Array>, chunks: Uint8Array[], size = 0): Promise<Buffer> {
  const chunk = await nextChunk(reader, size);
  if (chunk.done) return Buffer.concat(chunks);
  chunks.push(chunk.value);
  return readChunks(reader, chunks, size + chunk.value.byteLength);
}

async function readPdf(response: Response) {
  const reader = validateDownload(response);
  try { return await readChunks(reader, []); }
  finally { reader.releaseLock(); }
}

function verifiedPdf(bytes: Buffer) {
  if (!bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('FAA response is not a PDF (possible HTML/error page).');
  return { bytes, sha256: createHash('sha256').update(bytes).digest('hex') };
}

export async function downloadFaaPdf(url: string, transport: typeof fetch = fetch) {
  if (!faaSources.some(source => source.url === url)) throw new Error('FAA source is not allowlisted.');
  const response = await transport(url, { signal: AbortSignal.timeout(30_000), redirect: 'error', headers: { Accept: 'application/pdf' } });
  return verifiedPdf(await readPdf(response));
}

async function downloadReport(source: typeof faaSources[number], extractText: (bytes: Uint8Array) => Promise<string>, transport: typeof fetch): Promise<Report> {
  const file = await downloadFaaPdf(source.url, transport);
  const rows = parseFaaReport(await extractText(new Uint8Array(file.bytes)), source.year);
  return { source, file, rows };
}

function reconciledCounts(airport: string, earlier: Report, later: Report) {
  const oldRow = earlier.rows.get(airport)!, newRow = later.rows.get(airport)!;
  if (oldRow.current !== newRow.previous) throw new Error(`${airport}: overlapping ${earlier.source.year} counts disagree between reports. Existing snapshot preserved.`);
  return { previous: oldRow.current, current: newRow.current };
}

function importedAirport(airport: string, earlier: Report, later: Report) {
  const counts = reconciledCounts(airport, earlier, later);
  const growth = calculateGrowth({ year: earlier.source.year, enplanements: counts.previous }, { year: later.source.year, enplanements: counts.current })!;
  return { airport, previousYear: earlier.source.year, previousEnplanements: counts.previous,
    currentYear: later.source.year, currentEnplanements: counts.current, growthPercent: growth.growthPercent,
    overlappingYearMatches: true, sourceUrls: faaSources.map(source => source.url) };
}

function importedSource(report: Report, downloadedAt: string): ImportedSource {
  return { ...report.source, downloadedAt, sha256: report.file.sha256, rawFile: `raw/faa-${report.source.year}-${report.file.sha256}.pdf` };
}

function importedSnapshot(reports: Report[], downloadedAt: string): DownloadedSnapshot {
  return { schemaVersion: 1, mode: 'official-pdf-download', captureDate: downloadedAt,
    captureMethod: 'Original FAA PDFs downloaded, hashed, parsed with PDF.js, and reconciled across annual reports.',
    sources: reports.map(report => importedSource(report, downloadedAt)),
    results: validatedAirports.map(airport => importedAirport(airport, reports[0], reports[1])) };
}

export async function importFaaData(extractText: (bytes: Uint8Array) => Promise<string>, transport: typeof fetch = fetch) {
  const downloadedAt = new Date().toISOString(), reports: Report[] = [];
  for (const source of faaSources) reports.push(await downloadReport(source, extractText, transport));
  const snapshot = importedSnapshot(reports, downloadedAt);
  return { snapshot, rawFiles: reports.map(({ file }, index) => ({ path: snapshot.sources[index].rawFile, bytes: file.bytes })) };
}
