import { createRequire } from 'node:module';
import type { ModelClient, ModelItem, ModelRequest } from './model-client.ts';
type Part = { text?: string; functionCall?: { id?: string; name?: string; args?: Record<string, unknown> }; functionResponse?: { id?: string; name: string; response: Record<string, unknown> }; [key: string]: unknown };
type Content = { role: string; parts: Part[] };
type ReplayItem = ModelItem & { role?: string; content?: unknown; output?: string; geminiContent?: Content; geminiCallId?: string };
type Replay = { contents: Content[]; calls: Map<string, { name: string; id?: string }>; hasEvidence: boolean };
export type GeminiRequest = { model: string; contents: Content[]; config: Record<string, unknown> };
export interface GeminiGenerator {
  generateContent(request: GeminiRequest): Promise<{ candidates?: { content?: Content; finishReason?: string }[]; promptFeedback?: { blockReason?: string } }>;
}

function normalizeGeminiError(error: unknown): unknown {
  const original = error as { message?: string; status?: number };
  try { return parsedGeminiError(JSON.parse(original?.message ?? '')?.error, original.status) ?? error; }
  catch { return error; }
}

function parsedGeminiError(body: any, status?: number) {
  if (!body || typeof body.message !== 'string') return null;
  return Object.assign(new Error(body.message), { status: typeof body.code === 'number' ? body.code : status,
    code: typeof body.status === 'string' ? body.status : 'GEMINI_REQUEST_FAILED',
    type: typeof body.status === 'string' ? body.status : 'gemini_api_error' });
}

function loadGenerator(apiKey: string): GeminiGenerator {
  const require = createRequire(import.meta.url);
  const { GoogleGenAI } = require('@google/genai');
  return new GoogleGenAI({ apiKey, vertexai: false, httpOptions: { timeout: 30_000, retryOptions: { attempts: 1 } } }).models;
}

function rememberCall(replay: Replay, item: ReplayItem) {
  if (!item.call_id || !item.name) throw new Error('Invalid function call.');
  replay.calls.set(item.call_id, { name: item.name, id: item.geminiCallId });
}

function responsePart(replay: Replay, item: ReplayItem): Part {
  const call = replay.calls.get(item.call_id ?? '');
  if (!call) throw new Error('Function response has no matching call.');
  return { functionResponse: { name: call.name, ...(call.id ? { id: call.id } : {}), response: JSON.parse(String(item.output)) } };
}

function appendResponse(replay: Replay, item: ReplayItem) {
  const part = responsePart(replay, item), last = replay.contents.at(-1);
  if (last?.role === 'user' && last.parts.every(part => part.functionResponse)) last.parts.push(part);
  else replay.contents.push({ role: 'user', parts: [part] });
  replay.hasEvidence = true;
}

function replayModelContent(replay: Replay, item: ReplayItem) {
  if (!item.geminiContent) throw new Error('Missing Gemini model content.');
  // Preserve thought signatures and all original model parts unchanged.
  replay.contents.push(item.geminiContent);
}

function appendItem(replay: Replay, item: ReplayItem) {
  if (item.type === 'gemini_model_content') return replayModelContent(replay, item);
  if (item.type === 'function_call') return rememberCall(replay, item);
  if (item.type === 'function_call_output') return appendResponse(replay, item);
  if (item.role === 'user' || item.role === 'assistant')
    replay.contents.push({ role: item.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(item.content) }] });
}

function replayConversation(input: unknown[]): Replay {
  const replay: Replay = { contents: [], calls: new Map(), hasEvidence: false };
  input.forEach(item => appendItem(replay, item as ReplayItem));
  return replay;
}

function functionDeclaration(entry: unknown) {
  const tool = entry as { name: string; description: string; parameters: unknown };
  return { name: tool.name, description: tool.description, parametersJsonSchema: tool.parameters };
}

function requestConfig(request: ModelRequest, hasEvidence: boolean) {
  const phase = hasEvidence ? { responseMimeType: 'application/json', responseJsonSchema: request.text.format.schema }
    : { tools: [{ functionDeclarations: request.tools.map(functionDeclaration) }], toolConfig: { functionCallingConfig: { mode: 'ANY' } } };
  return { systemInstruction: request.instructions, maxOutputTokens: 2048, ...phase };
}

async function generate(models: GeminiGenerator, request: GeminiRequest) {
  try { return await models.generateContent(request); }
  catch (error) { throw normalizeGeminiError(error); }
}

function translateCall(part: Part, index: number, inputLength: number): ModelItem[] {
  if (!part.functionCall) return [];
  return [{ type: 'function_call', call_id: `gemini-${inputLength}-${index}`, geminiCallId: part.functionCall.id,
    name: part.functionCall.name, arguments: JSON.stringify(part.functionCall.args ?? {}) }];
}

function translateResponse(response: Awaited<ReturnType<GeminiGenerator['generateContent']>>, inputLength: number) {
  const candidate = response.candidates?.[0];
  if (response.promptFeedback?.blockReason || !candidate?.content) throw Object.assign(new Error('Gemini did not return an answer.'), { code: 'GEMINI_RESPONSE_BLOCKED', type: 'model_response_error' });
  const output = [{ type: 'gemini_model_content', geminiContent: candidate.content }, ...candidate.content.parts.flatMap((part, index) => translateCall(part, index, inputLength))];
  const output_text = candidate.content.parts.filter(part => typeof part.text === 'string' && !part.thought).map(part => part.text).join('');
  return { output, output_text, status: candidate.finishReason && candidate.finishReason !== 'STOP' ? 'incomplete' : 'completed' };
}

async function createResponse(models: GeminiGenerator, request: ModelRequest) {
  const replay = replayConversation(request.input);
  const response = await generate(models, { model: request.model, contents: replay.contents, config: requestConfig(request, replay.hasEvidence) });
  return translateResponse(response, request.input.length);
}

export function createGeminiClient(apiKey: string, injectedGenerator?: GeminiGenerator): ModelClient {
  const models = injectedGenerator ?? loadGenerator(apiKey);
  return { create: request => createResponse(models, request) };
}
