import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { downloadFaaPdf, faaSources, importFaaData, parseFaaReport } from '../data/faa-import.ts';
import { loadAirportRepository } from '../data/airport-repository.ts';

// Text fixtures are the previously verified FAA excerpts, not invented counts.
const fixture = JSON.parse(readFileSync(new URL('../../validation/faa-extracts.json', import.meta.url), 'utf8'));
function textFor(year: number) {
  return `Source: CY${year} ACAIS CY ${String(year).slice(2)} Enplanements CY ${String(year - 1).slice(2)} Enplanements % Change ` + fixture.sources.find((row: { year: number }) => row.year === year).text;
}
const transport = (async (url: unknown) => new Response(`%PDF-${String(url).includes('2024') ? '2024' : '2025'} transport fixture`, { headers: { 'Content-Type': 'application/pdf' } })) as typeof fetch;
const extractor = async (bytes: Uint8Array) => textFor(Buffer.from(bytes).toString().includes('2024') ? 2024 : 2025);

test('FAA text parser validates the known counts despite PDF whitespace/line wrapping', () => {
  const rows = parseFaaReport(textFor(2025).replaceAll(' ', '\n'), 2025);
  assert.deepEqual(rows.get('SFO'), { current: 26251850, previous: 25078968 });
  assert.deepEqual(rows.get('LAX'), { current: 36497303, previous: 37760834 });
  assert.deepEqual(rows.get('BOS'), { current: 21021153, previous: 21090721 });
});

test('wrong years, duplicate rows, missing counts and mismatched percentages fail closed', () => {
  assert.throws(() => parseFaaReport(textFor(2024), 2025), /headers/);
  assert.throws(() => parseFaaReport(textFor(2025) + ' NE MA BOS duplicated row', 2025), /expected one BOS/);
  assert.throws(() => parseFaaReport(textFor(2025).replace('36,497,303 37,760,834 -3.35%', ''), 2025), /cannot parse LAX/);
  assert.throws(() => parseFaaReport(textFor(2025).replace('4.68%', '99.00%'), 2025), /does not reconcile/);
});

test('downloads reject HTTP failures, HTML error bodies, excessive size and unknown URLs', async () => {
  await assert.rejects(downloadFaaPdf(faaSources[0].url, (async () => new Response('down', { status: 503 })) as typeof fetch), /HTTP 503/);
  await assert.rejects(downloadFaaPdf(faaSources[0].url, (async () => new Response('<html>blocked</html>')) as typeof fetch), /not a PDF/);
  await assert.rejects(downloadFaaPdf(faaSources[0].url, (async () => new Response('%PDF-test', { headers: { 'Content-Length': '999999999' } })) as typeof fetch), /size limit/);
  await assert.rejects(downloadFaaPdf('https://example.com/test.pdf', transport), /allowlisted/);
});

test('import captures hashes, URLs and years and repository verifies archived file integrity', async () => {
  const { snapshot, rawFiles } = await importFaaData(extractor, transport);
  assert.equal(snapshot.mode, 'official-pdf-download');
  assert.equal(snapshot.results.find(row => row.airport === 'SFO')!.growthPercent.toFixed(2), '4.68');
  assert.ok(snapshot.sources.every(source => /^[a-f0-9]{64}$/.test(source.sha256)));
  assert.deepEqual(snapshot.sources.map(source => source.url), faaSources.map(source => source.url));
  const directory = await mkdtemp(join(tmpdir(), 'faa-import-test-'));
  try {
    await mkdir(join(directory, 'raw'));
    for (const file of rawFiles) await writeFile(join(directory, file.path), file.bytes);
    const snapshotPath = pathToFileURL(join(directory, 'downloaded-snapshot.json'));
    await writeFile(snapshotPath, JSON.stringify(snapshot));
    const repository = loadAirportRepository(snapshotPath);
    assert.equal(repository.provenance.mode, 'official-pdf-download');
    assert.equal(repository.findByIata('LAX')!.observations[1].enplanements, 36497303);
    assert.equal(repository.findByIata('LAX')!.sources[0].sha256, snapshot.sources[0].sha256);
    await writeFile(join(directory, rawFiles[0].path), 'tampered');
    assert.throws(() => loadAirportRepository(snapshotPath), /checksum/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('overlapping annual counts must reconcile before producing a new snapshot', async () => {
  // Alter both counts consistently so the within-report growth check still passes,
  // then verify the independent cross-publication overlap check catches it.
  const changed = async (bytes: Uint8Array) => {
    const text = await extractor(bytes);
    return Buffer.from(bytes).toString().includes('2025')
      ? text.replace('36,497,303 37,760,834', '72,994,606 75,521,668') : text;
  };
  await assert.rejects(importFaaData(changed, transport), /overlapping 2024 counts disagree/);
});

test('unavailable downloaded snapshot retains the clearly labeled documented fallback', () => {
  const repository = loadAirportRepository(pathToFileURL(join(tmpdir(), `absent-faa-snapshot-${process.pid}.json`)));
  assert.equal(repository.provenance.mode, 'documented-local-snapshot');
  assert.ok(repository.provenance.limitations.some(line => line.includes('not downloaded')));
});
