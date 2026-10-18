import { mkdir, rename, writeFile, rm } from 'node:fs/promises';
import { importFaaData } from '../backend/data/faa-import.ts';
import { getOpenAIFailureDiagnostic } from '../backend/agent/diagnostics.ts';

async function pageText(document: any, number: number) {
  const page = await document.getPage(number);
  const content = await page.getTextContent();
  const text = content.items.filter((item: { str?: string }) => typeof item.str === 'string').map((item: { str: string }) => item.str).join(' ');
  page.cleanup();
  return text;
}

async function documentText(document: any) {
  const pages: string[] = [];
  for (let number = 1; number <= document.numPages; number++) pages.push(await pageText(document, number));
  return pages.join('\n');
}

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const moduleName = 'pdfjs-dist/legacy/build/pdf.mjs';
  const { getDocument } = await import(moduleName);
  const task = getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: false });
  try { return await documentText(await task.promise); }
  finally { await task.destroy(); }
}

const directory = new URL('./', import.meta.url);
const temporary = new URL(`./downloaded-snapshot.${process.pid}.tmp`, directory);
try {
  const { snapshot, rawFiles } = await importFaaData(extractPdfText);
  await mkdir(new URL('./raw/', directory), { recursive: true });
  for (const file of rawFiles) await writeFile(new URL(file.path, directory), file.bytes);
  await writeFile(temporary, JSON.stringify(snapshot, null, 2) + '\n');
  await rename(temporary, new URL('./downloaded-snapshot.json', directory));
  console.table(snapshot.results.map(row => ({ airport: row.airport, from: row.previousYear, to: row.currentYear,
    previousEnplanements: row.previousEnplanements, currentEnplanements: row.currentEnplanements, growthPercent: row.growthPercent })));
  console.log('Validated original FAA downloads saved. Restart the backend to load this snapshot.');
} catch (error) {
  await rm(temporary, { force: true });
  const diagnostic = getOpenAIFailureDiagnostic(error, 'FAA');
  console.error(JSON.stringify({ event: 'faa_import_failed', message: diagnostic.message,
    httpStatus: diagnostic.httpStatus, networkCode: diagnostic.networkCode, existingSnapshotPreserved: true }));
  process.exitCode = 1;
}
