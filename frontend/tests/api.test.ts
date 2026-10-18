import assert from 'node:assert/strict';
import test from 'node:test';
import { boundedHistory, sendMessage } from '../src/api.ts';
import type { ChatResponse, HistoryMessage } from '../src/api.ts';

test('a follow-up sends prior user and assistant turns to the same chat endpoint', async () => {
  const original = globalThis.fetch;
  const requests: { path: unknown; body: { message: string; history: HistoryMessage[] } }[] = [];
  const reply = 'SFO ranks first in the validated dataset.';
  globalThis.fetch = (async (path, options) => {
    requests.push({ path, body: JSON.parse(String(options?.body)) });
    return new Response(JSON.stringify({ reply, evidence: [], coverage: { airports: ['LAX', 'SFO', 'BOS'], limitations: [] }, provider: 'gemini', model: 'gemini-3.1-flash-lite', answerMode: 'verified-template' } satisfies ChatResponse));
  }) as typeof fetch;
  try {
    const first = await sendMessage('Why is SFO first?', []);
    await sendMessage('How does it compare to LAX?', [{ role: 'user', content: 'Why is SFO first?' }, { role: 'assistant', content: first.reply }]);
    assert.equal(requests[0].path, '/api/chat');
    assert.deepEqual(requests[0].body.history, []);
    assert.deepEqual(requests[1].body.history, [{ role: 'user', content: 'Why is SFO first?' }, { role: 'assistant', content: reply }]);
  } finally { globalThis.fetch = original; }
});

test('long conversations retain recent context within backend limits without mutating it', () => {
  const history: HistoryMessage[] = Array.from({ length: 24 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: String(i).padEnd(4000, 'x') }));
  const copy = structuredClone(history);
  const result = boundedHistory(history, 'follow-up');
  assert.ok(result.length <= 20);
  assert.ok(result.reduce((sum, entry) => sum + entry.content.length, 9) <= 24000);
  assert.equal(result.at(-1)?.content, history.at(-1)?.content);
  assert.equal(result[0].role, 'user');
  assert.deepEqual(history, copy);
});

test('provider error messages surface to the UI and do not trigger automatic retries', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => { calls++; return new Response(JSON.stringify({ error: { code: 'GEMINI_UNAVAILABLE', message: 'The AI service is unavailable.' } }), { status: 502 }); }) as typeof fetch;
  try {
    await assert.rejects(sendMessage('Rank airports', []), /AI service is unavailable/);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});

test('malformed successful chat responses are rejected instead of displayed', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ reply: 'missing evidence' }))) as typeof fetch;
  try { await assert.rejects(sendMessage('Rank airports', []), /incomplete/); }
  finally { globalThis.fetch = original; }
});
