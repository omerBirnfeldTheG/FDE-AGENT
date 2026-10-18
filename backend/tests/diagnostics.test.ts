import assert from 'node:assert/strict';
import test from 'node:test';
import { getOpenAIFailureDiagnostic } from '../agent/diagnostics.ts';
import { createOpenAIClient } from '../agent/openai-client.ts';
import { createChatAgent } from '../agent/chat.ts';
import { loadAirportRepository } from '../data/airport-repository.ts';

test('diagnostics retain status/code/type and strip credentials, URLs, headers and newlines', () => {
  const key = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'arbitrary-real-secret-test-value';
  try {
    const error = {
      status: 429, code: 'insufficient_quota', type: 'insufficient_quota',
      message: 'Quota exhausted. arbitrary-real-secret-test-value sk-proj-abc123 Bearer other-secret\nAuthorization: another-credential\nhttps://user:password@example.com/?token=sensitive',
      headers: { authorization: 'SECRET_HEADER' }, request: { apiKey: 'SECRET_REQUEST' }
    };
    const diagnostic = getOpenAIFailureDiagnostic(error, 'gpt-4.1-mini');
    assert.equal(diagnostic.httpStatus, 429);
    assert.equal(diagnostic.errorCode, 'insufficient_quota');
    assert.equal(diagnostic.errorType, 'insufficient_quota');
    const text = JSON.stringify(diagnostic);
    for (const secret of ['arbitrary-real-secret-test-value', 'sk-proj-abc123', 'other-secret', 'another-credential', 'sensitive', 'SECRET_HEADER', 'SECRET_REQUEST']) assert.ok(!text.includes(secret));
    assert.ok(!diagnostic.message.includes('\n'));
  } finally {
    if (key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = key;
  }
});

test('network diagnostics expose cause code without logging raw cause or stack', () => {
  const error = Object.assign(new Error('Connection error.'), { name: 'APIConnectionError', cause: { message: 'secret details', cause: { code: 'ENOTFOUND' } } });
  const diagnostic = getOpenAIFailureDiagnostic(error, 'gpt-4.1-mini');
  assert.equal(diagnostic.networkCode, 'ENOTFOUND');
  assert.equal(diagnostic.httpStatus, null);
  assert.equal(diagnostic.errorType, 'APIConnectionError');
  assert.ok(!JSON.stringify(diagnostic).includes('secret details'));
});

test('official SDK sends the actual Responses payload and does not retry provider errors', async () => {
  let attempts = 0;
  const client = createOpenAIClient('sdk-test-key-not-real', { fetch: (async (_url, options) => {
    attempts++;
    const request = JSON.parse(String(options?.body));
    assert.equal(request.model, 'gpt-4.1-mini');
    assert.equal(request.tool_choice, 'required');
    assert.equal(request.store, false);
    assert.equal(request.text.format.type, 'json_schema');
    assert.equal(request.text.format.strict, true);
    assert.deepEqual(request.tools.map((tool: { name: string }) => tool.name), ['get_airport_weather', 'get_airport_growth', 'get_demand_growth_rankings']);
    assert.ok(request.tools.every((tool: { strict: boolean }) => tool.strict));
    return new Response(JSON.stringify({ error: { message: 'Test quota exhausted', type: 'insufficient_quota', code: 'insufficient_quota' } }), { status: 429, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch });
  await assert.rejects(createChatAgent(loadAirportRepository(), client)({ message: 'Rank airports', history: [] }), /AI service is unavailable/);
  assert.equal(attempts, 1);
});
