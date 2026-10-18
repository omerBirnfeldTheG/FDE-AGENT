import assert from 'node:assert/strict';
import test from 'node:test';
import { createOllamaClient } from '../agent/ollama-client.ts';
import { createChatAgent } from '../agent/chat.ts';
import { loadAirportRepository } from '../data/airport-repository.ts';

test('local model calls existing tools and receives native replay plus final schema', async () => {
  const requests: any[] = [];
  const client = createOllamaClient(undefined, (async (url, options) => {
    assert.equal(String(url), 'http://127.0.0.1:11434/api/chat');
    assert.deepEqual(options?.headers, { 'Content-Type': 'application/json' });
    const body = JSON.parse(String(options?.body)); requests.push(body);
    return new Response(JSON.stringify({ done: true, message: requests.length === 1
      ? { content: '', tool_calls: [{ function: { name: 'get_demand_growth_rankings', arguments: {} } }] }
      : { content: JSON.stringify({ view: 'comparison', iatas: ['SFO', 'LAX'] }) } }));
  }) as typeof fetch);
  const result = await createChatAgent(loadAirportRepository(), client, 'qwen3:4b', 'ollama')({ message: 'How does it compare to LAX?', history: [{ role: 'user', content: 'Why is SFO first?' }] });
  assert.equal(result.provider, 'ollama');
  assert.match(result.reply, /8.02 percentage points/);
  assert.equal(requests[0].format, undefined);
  assert.equal(requests[0].tools.length, 4);
  assert.equal(requests[1].tools, undefined);
  assert.equal(requests[1].format.type, 'object');
  assert.equal(requests[1].messages.find((row: any) => row.role === 'tool').tool_name, 'get_demand_growth_rankings');
  assert.match(requests[1].messages.find((row: any) => row.role === 'tool').content, /73.383/);
});

test('local model failures are graceful and never fall back to a paid provider', async () => {
  let calls = 0;
  const client = createOllamaClient(undefined, (async () => { calls++; return new Response('{}', { status: 404 }); }) as typeof fetch);
  await assert.rejects(createChatAgent(loadAirportRepository(), client, 'qwen3:4b', 'ollama')({ message: 'Rank airports', history: [] }), error => (error as { code: string }).code === 'OLLAMA_UNAVAILABLE');
  assert.equal(calls, 1);
});

test('Ollama configuration only permits local origins', () => {
  for (const url of ['https://example.com', 'http://user:password@localhost:11434', 'http://localhost:11434/path']) assert.throws(() => createOllamaClient(url));
});

test('local model cannot bypass verified tool evidence', async () => {
  const client = createOllamaClient(undefined, (async () => new Response(JSON.stringify({ done: true, message: { content: '{"view":"rankings","iatas":[]}' } }))) as typeof fetch);
  await assert.rejects(createChatAgent(loadAirportRepository(), client, 'qwen3:4b', 'ollama')({ message: 'Rank airports', history: [] }), /verified data/);
});
