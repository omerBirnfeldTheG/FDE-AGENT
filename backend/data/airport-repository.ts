import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { Observation } from '../domain/growth.ts';

export type DataSource = {
  reportingYear: number;
  publicationDate: string;
  title: string;
  url: string;
  downloadedAt?: string;
  sha256?: string;
};
export type AirportData = {
  iata: string;
  observations: Observation[];
  sources: DataSource[];
};
export interface AirportRepository {
  findByIata(iata: string): AirportData | undefined;
  list(): AirportData[];
  provenance: { mode: string; capturedOn: string; sourceReferencesVerifiedOn: string; limitations: string[] };
}

type Snapshot = { schemaVersion?: number; mode?: string; captureDate: string; sources?: any[]; results: any[] };
type Extracts = { sources: any[] };

function readJson(path: URL) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function verifyArchive(source: any, path: URL) {
  if (!/^[a-f0-9]{64}$/.test(source.sha256) || source.rawFile !== `raw/faa-${source.year}-${source.sha256}.pdf`) throw new Error('Invalid FAA archive reference.');
  const bytes = readFileSync(new URL(source.rawFile, path));
  if (createHash('sha256').update(bytes).digest('hex') !== source.sha256) throw new Error('FAA original-file checksum does not match the snapshot.');
}

function verifySnapshot(snapshot: Snapshot, path: URL) {
  if (snapshot.schemaVersion !== 1 || snapshot.mode !== 'official-pdf-download') throw new Error('Unsupported downloaded FAA snapshot format.');
  snapshot.sources!.forEach(source => verifyArchive(source, path));
}

function observationsFor(row: any): Observation[] {
  const observations = [{ year: row.previousYear, enplanements: row.previousEnplanements }, { year: row.currentYear, enplanements: row.currentEnplanements }];
  observations.forEach(validateObservation);
  if (row.currentYear !== row.previousYear + 1) throw new Error('Snapshot years must be consecutive.');
  return observations;
}

function validateObservation(row: Observation) {
  if (!Number.isSafeInteger(row.year) || !Number.isSafeInteger(row.enplanements) || row.enplanements === null || row.enplanements < 0)
    throw new Error('Invalid observation in snapshot.');
}

function sourceFor(row: any, observation: Observation, extracts: Extracts, downloaded: boolean): DataSource {
  const source = extracts.sources.find(entry => entry.year === observation.year);
  if (!source || !row.sourceUrls.includes(source.url) || new URL(source.url).hostname !== 'www.faa.gov') throw new Error('Missing or inconsistent official source metadata.');
  return { reportingYear: source.year, publicationDate: source.publicationDate, title: source.title, url: source.url,
    ...(downloaded ? { downloadedAt: source.downloadedAt, sha256: source.sha256 } : {}) };
}

function addAirport(airports: Map<string, AirportData>, row: any, extracts: Extracts, downloaded: boolean) {
  if (!/^[A-Z]{3}$/.test(row.airport) || airports.has(row.airport)) throw new Error('Invalid or duplicate airport in snapshot.');
  const observations = observationsFor(row);
  const sources = observations.map(observation => sourceFor(row, observation, extracts, downloaded));
  airports.set(row.airport, { iata: row.airport, observations, sources });
}

const sharedLimitations = [
  'Coverage is limited to LAX, SFO and BOS; responses are not live FAA queries.',
  'Enplanements are calendar-year passenger boardings, not total airport passengers or unique travelers.',
  'The 2025 commercial-service PDF link contains an all-airports-by-state report.',
  'Annual traffic does not measure terminal capacity or explain changes in demand.'
];
function acquisitionNote(downloaded: boolean) {
  return downloaded ? 'Counts were parsed from archived original FAA PDFs and validated across annual reports. API responses use the downloaded snapshot; run npm run refresh:data to refresh it.'
    : 'Original PDF/XLSX files were not downloaded locally: FAA host DNS resolution failed. Counts come from documented browser-parsed PDF excerpts.';
}

function provenance(snapshot: Snapshot, downloaded: boolean) {
  return { mode: downloaded ? 'official-pdf-download' : 'documented-local-snapshot', capturedOn: snapshot.captureDate,
    sourceReferencesVerifiedOn: downloaded ? snapshot.captureDate.slice(0, 10) : '2026-10-10',
    limitations: [acquisitionNote(downloaded), ...sharedLimitations] };
}

function buildRepository(snapshot: Snapshot, extracts: Extracts, downloaded: boolean): AirportRepository {
  const airports = new Map<string, AirportData>();
  snapshot.results.forEach(row => addAirport(airports, row, extracts, downloaded));
  return { findByIata: iata => airports.get(iata), list: () => [...airports.values()], provenance: provenance(snapshot, downloaded) };
}

export function loadAirportRepository(downloadedPath = new URL('../../validation/downloaded-snapshot.json', import.meta.url)): AirportRepository {
  const downloaded = existsSync(downloadedPath);
  const snapshot = readJson(downloaded ? downloadedPath : new URL('../../validation/results.json', import.meta.url));
  if (downloaded) verifySnapshot(snapshot, downloadedPath);
  const extracts = downloaded ? snapshot : readJson(new URL('../../validation/faa-extracts.json', import.meta.url));
  return buildRepository(snapshot, extracts, downloaded);
}
