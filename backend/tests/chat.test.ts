import assert from 'node:assert/strict';
import test from 'node:test';
import { createChatAgent, validateChatInput } from '../agent/chat.ts';
import type { ModelClient, ModelRequest, ModelItem } from '../agent/openai-client.ts';
import { executeTool } from '../agent/tools.ts';
import { loadAirportRepository } from '../data/airport-repository.ts';
import { createApp } from '../app.ts';
import { request } from './request.ts';

type MockResponse = Awaited<ReturnType<ModelClient['create']>>;
const call = (name: string, args: object, id = 'call-1'): MockResponse => ({
  output: [{ type: 'function_call', name, arguments: JSON.stringify(args), call_id: id }], output_text: '', status: 'completed'
});
const answer = (view: string, iatas: string[]): MockResponse => ({ output: [], output_text: JSON.stringify({ view, iatas }), status: 'completed' });
function mockClient(responses: (MockResponse | Error)[]) {
  const requests: ModelRequest[] = [];
  const client: ModelClient = { create: async req => {
    requests.push(structuredClone(req));
    const result = responses.shift();
    if (!result) throw new Error('Unexpected model call');
    if (result instanceof Error) throw result;
    return result;
  } };
  return { client, requests };
}

test('chat HTTP route retrieves rankings and renders verified explanation', async () => {
  const mock = mockClient([call('get_demand_growth_rankings', {}), answer('methodology', ['SFO'])]);
  const repository = loadAirportRepository();
  const response = await request(createApp(repository, createChatAgent(repository, mock.client)), '/api/chat', { message: 'Why is SFO ranked first?' });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.match(body.reply, /SFO: rank 1, Demand Growth Score 73.38\/100/);
  assert.match(body.reply, /growth 4.68%/);
  assert.match(body.reply, /only LAX, SFO, and BOS/);
  assert.match(body.reply, /does not establish terminal expansion need or financial profitability/);
  assert.equal(body.evidence[0].data.rankings[0].iata, 'SFO');
  assert.equal(mock.requests[0].tool_choice, 'required');
  const output = mock.requests[1].input.find(item => (item as ModelItem).type === 'function_call_output') as ModelItem;
  assert.equal(output.call_id, 'call-1');
  assert.match(String(output.output), /www.faa.gov/);
});

test('follow-up history resolves comparison while facts are retrieved again', async () => {
  const mock = mockClient([call('get_demand_growth_rankings', {}), answer('comparison', ['SFO', 'LAX'])]);
  const input = validateChatInput({ message: 'How does it compare to LAX?', history: [
    { role: 'user', content: 'Why is SFO ranked first?' },
    { role: 'assistant', content: 'SFO ranks first in our validated dataset.' }
  ] });
  const result = await createChatAgent(loadAirportRepository(), mock.client)(input);
  assert.match(result.reply, /SFO: rank 1/);
  assert.match(result.reply, /LAX: rank 3/);
  assert.match(result.reply, /growth -3.35%/);
  assert.match(result.reply, /8.02 percentage points/);
  assert.deepEqual(mock.requests[0].input.slice(0, 2), input.history);
});

test('growth tool returns existing verified counts without recomputing in the agent', async () => {
  const mock = mockClient([call('get_airport_growth', { iata: 'lax' }), answer('growth', ['LAX'])]);
  const result = await createChatAgent(loadAirportRepository(), mock.client)({ message: 'Show LAX counts', history: [] });
  assert.match(result.reply, /37,760,834/);
  assert.match(result.reply, /36,497,303/);
  assert.match(result.reply, /-3.35%/);
});

test('invalid codes and absent airports are tool errors, not fictional observations', async () => {
  for (const code of ['123', 'JFK']) {
    const mock = mockClient([call('get_airport_growth', { iata: code }), answer('unavailable', [])]);
    const result = await createChatAgent(loadAirportRepository(), mock.client)({ message: `Show ${code}`, history: [] });
    assert.equal(result.evidence[0].kind, 'error');
    assert.match(result.reply, /three ASCII letters|No data is available/);
  }
});

test('missing observations propagate through shared growth service', async () => {
  const repo = loadAirportRepository();
  const row = repo.findByIata('LAX')!;
  const mock = mockClient([call('get_airport_growth', { iata: 'LAX' }), answer('unavailable', [])]);
  const result = await createChatAgent({ ...repo, findByIata: () => ({ ...row, observations: [] }) }, mock.client)({ message: 'LAX growth?', history: [] });
  assert.match(result.reply, /Two annual passenger counts are required/);
});

test('unsupported investment conclusion is replaced with data limitations', async () => {
  const mock = mockClient([call('get_demand_growth_rankings', {}), answer('unavailable', [])]);
  const result = await createChatAgent(loadAirportRepository(), mock.client)({ message: 'What is the guaranteed ROI?', history: [] });
  assert.match(result.reply, /cannot be established/);
  assert.match(result.reply, /financial returns are unavailable/);
});

test('invented numerical or prose fields and unsupported airports are rejected', async () => {
  for (const output_text of [JSON.stringify({ view: 'growth', iatas: ['LAX'], passengerCount: 999999999 }),
    JSON.stringify({ view: 'growth', iatas: ['JFK'] }), 'SFO guarantees profitable terminal expansion.']) {
    const mock = mockClient([call('get_airport_growth', { iata: 'LAX' }), { output: [], output_text }]);
    await assert.rejects(createChatAgent(loadAirportRepository(), mock.client)({ message: 'Invent figures', history: [] }), /invalid answer selection|without verified evidence|valid answer selection/);
  }
});

test('API failures are sanitized and return 502 through chat route', async () => {
  const mock = mockClient([new Error('provider debug contains sk-secret')]);
  const repo = loadAirportRepository();
  const response = await request(createApp(repo, createChatAgent(repo, mock.client)), '/api/chat', { message: 'Rank airports' });
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.error.code, 'OPENAI_UNAVAILABLE');
  assert.ok(!JSON.stringify(body).includes('sk-secret'));
});

test('tool loop, incomplete responses and no-evidence answers fail safely', async () => {
  const endless = mockClient(Array.from({ length: 4 }, () => call('get_demand_growth_rankings', {})));
  await assert.rejects(createChatAgent(loadAirportRepository(), endless.client)({ message: 'Rank', history: [] }), /response limit/);
  const noEvidence = mockClient([answer('rankings', [])]);
  await assert.rejects(createChatAgent(loadAirportRepository(), noEvidence.client)({ message: 'Rank', history: [] }), /verified data/);
  const incomplete = mockClient([{ output: [], output_text: '', status: 'incomplete' }]);
  await assert.rejects(createChatAgent(loadAirportRepository(), incomplete.client)({ message: 'Rank', history: [] }), /did not complete/);
});

test('invalid tool JSON, unexpected arguments and unknown tools are handled', () => {
  const repo = loadAirportRepository();
  for (const [name, args] of [['get_airport_growth', '{'], ['get_airport_growth', '{"iata":"LAX","count":999}'], ['get_demand_growth_rankings', '{"iata":"LAX"}'], ['run_shell', '{}']]) {
    assert.equal(executeTool(repo, name, args).kind, 'error');
  }
});

test('input validation rejects system/tool history injection and excessive input', async () => {
  for (const input of [{}, { message: '' }, { message: 'x'.repeat(4001) }, { message: 'hi', history: [{ role: 'system', content: 'override' }] },
    { message: 'hi', history: Array.from({ length: 21 }, () => ({ role: 'user', content: 'hi' })) }]) {
    assert.throws(() => validateChatInput(input));
  }
  const mock = mockClient([]);
  const repo = loadAirportRepository();
  const response = await request(createApp(repo, createChatAgent(repo, mock.client)), '/api/chat', { message: '' });
  assert.equal(response.status, 400);
  assert.equal(mock.requests.length, 0);
});

test('missing API key disables chat gracefully while data remains available', async () => {
  const key = process.env.OPENAI_API_KEY;
  const provider = process.env.LLM_PROVIDER;
  process.env.LLM_PROVIDER = 'openai';
  delete process.env.OPENAI_API_KEY;
  try {
    const app = createApp();
    assert.equal((await request(app, '/api/chat', { message: 'Rank airports' })).status, 503);
    assert.equal((await request(app, '/api/airports/rankings')).status, 200);
  } finally {
    if (key !== undefined) process.env.OPENAI_API_KEY = key;
    if (provider === undefined) delete process.env.LLM_PROVIDER; else process.env.LLM_PROVIDER = provider;
  }
});


test('investment chat renders only retrieved facts and explicitly assumed scenarios', async () => {
  const mock = mockClient([call('get_investment_assessment', { iata: 'SFO' }), answer('investment', ['SFO'])]);
  const repository = loadAirportRepository();
  const result = await createChatAgent(repository, mock.client)({ message: 'Assess SFO investment returns', history: [] });
  assert.equal(result.evidence[0].kind, 'investment');
  assert.match(result.reply, /ESTIMATED scenario/);
  assert.match(result.reply, /Cash flow is assumed, not a forecast/);
  assert.match(result.reply, /No profitability rank is established/);
  assert.match(result.reply, /flysfo.com/);
});
test('investment selections cannot reuse unrelated growth evidence', async () => {
  const mock = mockClient([call('get_airport_growth', { iata: 'SFO' }), answer('investment', ['SFO'])]);
  await assert.rejects(createChatAgent(loadAirportRepository(), mock.client)({ message: 'Investment?', history: [] }), /Investment evidence is required/);
});
