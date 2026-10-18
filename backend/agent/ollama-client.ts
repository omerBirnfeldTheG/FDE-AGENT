import type { ModelClient, ModelItem, ModelRequest } from './model-client.ts';
type Message = { role: string; content: string; tool_name?: string; tool_calls?: unknown[] };
type Replay = { messages: Message[]; names: Map<string, string>; hasEvidence: boolean };
type ReplayItem = ModelItem & { role?: string; content?: string; output?: string };
type NativeResponse = { done: boolean; done_reason?: string; message?: { content?: string; tool_calls?: { function: { name: string; arguments: object } }[] } };

function localOrigin(baseUrl: string) {
  const url = new URL(baseUrl);
  const local = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!local || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Ollama must use a local HTTP origin without credentials.');
  return url;
}

function appendCall(replay: Replay, item: ReplayItem) {
  if (!item.call_id || !item.name || !item.arguments) throw new Error('Invalid tool-call replay.');
  replay.names.set(item.call_id, item.name);
  const call = { type: 'function', function: { name: item.name, arguments: JSON.parse(item.arguments) } }, last = replay.messages.at(-1);
  if (last?.role === 'assistant' && last.tool_calls) last.tool_calls.push(call);
  else replay.messages.push({ role: 'assistant', content: '', tool_calls: [call] });
}

function appendToolResult(replay: Replay, item: ReplayItem) {
  const name = replay.names.get(item.call_id ?? '');
  if (!name) throw new Error('Tool output has no matching call.');
  replay.messages.push({ role: 'tool', tool_name: name, content: String(item.output) });
  replay.hasEvidence = true;
}

function appendItem(replay: Replay, item: ReplayItem) {
  if (item.type === 'function_call') return appendCall(replay, item);
  if (item.type === 'function_call_output') return appendToolResult(replay, item);
  if (item.role === 'user' || item.role === 'assistant') replay.messages.push({ role: item.role, content: String(item.content) });
}

function replayConversation(request: ModelRequest) {
  const replay: Replay = { messages: [{ role: 'system', content: request.instructions }], names: new Map(), hasEvidence: false };
  request.input.forEach(item => appendItem(replay, item as ReplayItem));
  replay.messages[0].content += replay.hasEvidence ? ' Tool results are now available. Return the final JSON selection only.' : ' First call an available tool. Do not return final JSON until tool results are available.';
  return replay;
}

function nativeTool(entry: unknown) {
  const tool = entry as { name: string; description: string; parameters: unknown };
  return { type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.parameters } };
}

function requestBody(request: ModelRequest) {
  const replay = replayConversation(request);
  const phase = replay.hasEvidence ? { format: request.text.format.schema } : { tools: request.tools.map(nativeTool) };
  return { model: request.model, messages: replay.messages, stream: false, think: false, ...phase,
    options: { temperature: 0, num_predict: request.max_output_tokens, num_ctx: 8192 } };
}

function validateHttpResponse(response: Response) {
  if (response.ok) return;
  const message = response.status === 404 ? 'Ollama model is unavailable. Run ollama pull for the configured model.' : 'Local Ollama request failed. Check the Ollama server.';
  throw Object.assign(new Error(message), { status: response.status, code: 'OLLAMA_REQUEST_FAILED', type: 'local_model_error' });
}

function translateResponse(result: NativeResponse, inputLength: number) {
  if (!result.message || !result.done) throw new Error('Ollama returned an incomplete response.');
  const output: ModelItem[] = (result.message.tool_calls ?? []).map((call, index) => ({
    type: 'function_call', call_id: `ollama-${inputLength}-${index}`, name: call.function.name, arguments: JSON.stringify(call.function.arguments) }));
  return { output, output_text: result.message.content ?? '', status: result.done_reason === 'length' ? 'incomplete' : 'completed' };
}

async function createResponse(url: URL, transport: typeof fetch, request: ModelRequest) {
  const response = await transport(new URL('/api/chat', url), { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody(request)), signal: AbortSignal.timeout(300_000), redirect: 'error' });
  validateHttpResponse(response);
  return translateResponse(await response.json() as NativeResponse, request.input.length);
}

export function createOllamaClient(baseUrl = 'http://127.0.0.1:11434', transport: typeof fetch = fetch): ModelClient {
  const url = localOrigin(baseUrl);
  return { create: request => createResponse(url, transport, request) };
}
