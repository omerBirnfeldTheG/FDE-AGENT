import assert from 'node:assert/strict';
import test from 'node:test';
import { createChatAgent } from '../agent/chat.ts';
import { loadAirportRepository } from '../data/airport-repository.ts';

test('flow logs correlate model, tool and answer stages without logging conversation or tool payloads', async () => {
  const original = console.info;
  const lines: string[] = [];
  console.info = line => { lines.push(String(line)); };
  let round = 0;
  const requestId = '12345678-1234-1234-1234-123456789abc';
  try {
    await createChatAgent(loadAirportRepository(), { create: async () => ++round === 1
      ? { output: [{ type: 'function_call', name: 'get_demand_growth_rankings', arguments: '{}', call_id: 'call' }], output_text: '' }
      : { output: [], output_text: '{"view":"rankings","iatas":[]}' }
    })({ message: 'private-user-question', history: [{ role: 'user', content: 'private-history' }] }, { requestId });
    const events = lines.map(line => JSON.parse(line));
    assert.ok(events.every(event => event.requestId === requestId));
    for (const expected of ['chat_agent_started', 'chat_model_request_started', 'chat_model_response_received', 'chat_tool_started', 'chat_tool_completed', 'chat_answer_validated']) {
      assert.ok(events.some(event => event.event === expected));
    }
    assert.ok(!lines.join('').includes('private-user-question'));
    assert.ok(!lines.join('').includes('private-history'));
    assert.ok(!lines.join('').includes('25078968'));
  } finally { console.info = original; }
});
