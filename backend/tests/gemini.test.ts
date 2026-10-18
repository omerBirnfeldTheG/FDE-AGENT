import assert from 'node:assert/strict';
import test from 'node:test';
import { createGeminiClient } from '../agent/gemini-client.ts';
import type { GeminiGenerator, GeminiRequest } from '../agent/gemini-client.ts';
import { createChatAgent } from '../agent/chat.ts';
import { loadAirportRepository } from '../data/airport-repository.ts';
import { getOpenAIFailureDiagnostic } from '../agent/diagnostics.ts';
import { createApp } from '../app.ts';
import { request } from './request.ts';

type GeminiResponse = Awaited<ReturnType<GeminiGenerator['generateContent']>>;
const functionCall = (name: string, args: Record<string, unknown>, id = 'native-call'): GeminiResponse => ({
  candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [
    { functionCall: { name, args, id }, thoughtSignature: 'opaque-signature-preserve-verbatim' }
  ] } }]
});
const selection = (view: string, iatas: string[]): GeminiResponse => ({ candidates: [{ finishReason: 'STOP', content: {
  role: 'model', parts: [{ text: JSON.stringify({ view, iatas }) }]
} }] });
function mockedGenerator(responses: (GeminiResponse | Error)[]) {
  const requests: GeminiRequest[] = [];
  const generator: GeminiGenerator = { generateContent: async request => {
    requests.push(structuredClone(request));
    const result = responses.shift();
    if (!result) throw new Error('Unexpected request');
    if (result instanceof Error) throw result;
    return result;
  } };
  return { generator, requests };
}

test('Gemini ranks via existing tools and replays original thought signatures and native call IDs', async () => {
  const mocked = mockedGenerator([functionCall('get_demand_growth_rankings', {}), selection('methodology', ['SFO'])]);
  const repo = loadAirportRepository();
  const agent = createChatAgent(repo, createGeminiClient('mock-key', mocked.generator), 'gemini-3.1-flash-lite', 'gemini');
  const response = await request(createApp(repo, agent), '/api/chat', { message: 'Why is SFO first?' });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.provider, 'gemini');
  assert.match(body.reply, /SFO: rank 1, Demand Growth Score 73.38/);
  assert.match(body.reply, /only LAX, SFO, and BOS/);
  assert.match(body.reply, /financial profitability/);
  assert.equal(mocked.requests[0].model, 'gemini-3.1-flash-lite');
  assert.deepEqual(mocked.requests[0].config.toolConfig, { functionCallingConfig: { mode: 'ANY' } });
  assert.equal(mocked.requests[0].config.responseMimeType, undefined);
  assert.equal(mocked.requests[1].config.responseMimeType, 'application/json');
  assert.equal(mocked.requests[1].config.tools, undefined);
  const original = mocked.requests[1].contents.find(item => item.role === 'model')!;
  assert.equal(original.parts[0].thoughtSignature, 'opaque-signature-preserve-verbatim');
  const result = mocked.requests[1].contents.at(-1)!.parts[0].functionResponse!;
  assert.equal(result.id, 'native-call');
  assert.equal(result.name, 'get_demand_growth_rankings');
  assert.equal(result.response.kind, 'rankings');
  assert.match(JSON.stringify(result.response), /www.faa.gov/);
});

test('Gemini translates conversation history and provides verified follow-up comparison', async () => {
  const mocked = mockedGenerator([functionCall('get_demand_growth_rankings', {}), selection('comparison', ['SFO', 'LAX'])]);
  const history = [{ role: 'user' as const, content: 'Why is SFO first?' }, { role: 'assistant' as const, content: 'SFO ranks first in the validated dataset.' }];
  const result = await createChatAgent(loadAirportRepository(), createGeminiClient('mock-key', mocked.generator), 'gemini-3.1-flash-lite', 'gemini')({ message: 'How does it compare to LAX?', history });
  assert.match(result.reply, /8.02 percentage points/);
  assert.equal(mocked.requests[0].contents[1].role, 'model');
  assert.equal(mocked.requests[0].contents[1].parts[0].text, history[1].content);
});

test('Gemini growth tool reuses counts and reports missing/invalid airports', async () => {
  for (const iata of ['LAX', 'JFK', '123']) {
    const mocked = mockedGenerator([functionCall('get_airport_growth', { iata }), selection(iata === 'LAX' ? 'growth' : 'unavailable', iata === 'LAX' ? ['LAX'] : [])]);
    const result = await createChatAgent(loadAirportRepository(), createGeminiClient('mock-key', mocked.generator), 'gemini-3.1-flash-lite', 'gemini')({ message: `Show ${iata}`, history: [] });
    assert.match(result.reply, iata === 'LAX' ? /37,760,834/ : /No data is available|three ASCII letters/);
  }
});

test('Gemini API errors are normalized, sanitized and not retried', async () => {
  const mocked = mockedGenerator([new Error(JSON.stringify({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Quota exhausted; AIzaFakeSecret123' } }))]);
  const client = createGeminiClient('mock-key', mocked.generator);
  const repo = loadAirportRepository();
  const response = await request(createApp(repo, createChatAgent(repo, client, 'gemini-3.1-flash-lite', 'gemini')), '/api/chat', { message: 'Rank airports' });
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error.code, 'GEMINI_UNAVAILABLE');
  assert.equal(mocked.requests.length, 1);
  const diagnostic = getOpenAIFailureDiagnostic({ status: 429, code: 'RESOURCE_EXHAUSTED', message: 'AIzaFakeSecret123' }, 'gemini-3.1-flash-lite');
  assert.ok(!JSON.stringify(diagnostic).includes('AIzaFakeSecret123'));
});

test('Gemini preserves multiple model function calls and groups native function responses', async () => {
  const first = functionCall('get_airport_growth', { iata: 'SFO' }, 'sfo-call');
  first.candidates![0].content!.parts.push({ functionCall: { name: 'get_airport_growth', args: { iata: 'LAX' }, id: 'lax-call' } });
  const mocked = mockedGenerator([first, selection('growth', ['SFO', 'LAX'])]);
  const result = await createChatAgent(loadAirportRepository(), createGeminiClient('mock-key', mocked.generator), 'gemini-3.1-flash-lite', 'gemini')({ message: 'Show both counts', history: [] });
  assert.equal(result.evidence.length, 2);
  const parts = mocked.requests[1].contents.at(-1)!.parts;
  assert.deepEqual(parts.map(part => part.functionResponse!.id), ['sfo-call', 'lax-call']);
});

test('Gemini answers with invented extra fields fail validation', async () => {
  const invented: GeminiResponse = { candidates: [{ content: { role: 'model', parts: [{ text: '{"view":"growth","iatas":["LAX"],"roi":99}' }] } }] };
  const mocked = mockedGenerator([functionCall('get_airport_growth', { iata: 'LAX' }), invented]);
  await assert.rejects(createChatAgent(loadAirportRepository(), createGeminiClient('mock-key', mocked.generator), 'gemini-3.1-flash-lite', 'gemini')({ message: 'Invent ROI', history: [] }), /invalid answer selection/);
});

test('Gemini safety-blocked responses fail gracefully', async () => {
  const mocked = mockedGenerator([{ promptFeedback: { blockReason: 'SAFETY' } }]);
  await assert.rejects(createChatAgent(loadAirportRepository(), createGeminiClient('mock-key', mocked.generator), 'gemini-3.1-flash-lite', 'gemini')({ message: 'Rank', history: [] }), /AI service is unavailable/);
});
