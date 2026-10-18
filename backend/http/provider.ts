import type { AirportRepository } from '../data/airport-repository.ts';
import type { WeatherLookup } from '../data/aviation-weather.ts';
import { createChatAgent, ChatError } from '../agent/chat.ts';
import { createGeminiClient } from '../agent/gemini-client.ts';
import { createOpenAIClient } from '../agent/openai-client.ts';
import { createOllamaClient } from '../agent/ollama-client.ts';

function requireKey(name: string, placeholder: string) {
  const key = process.env[name];
  if (!key || key === placeholder) throw new ChatError(503, 'CHAT_NOT_CONFIGURED', `Set ${name} privately in the server environment.`);
  return key;
}

function createGeminiAgent(repository: AirportRepository, weather: WeatherLookup) {
  const key = requireKey('GEMINI_API_KEY', 'your_actual_gemini_key');
  try { return createChatAgent(repository, createGeminiClient(key), process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite', 'gemini', weather); }
  catch { throw new ChatError(503, 'CHAT_NOT_CONFIGURED', 'Install the official Gemini SDK with npm run setup:gemini, then restart the server.'); }
}

function createOpenAIAgent(repository: AirportRepository, weather: WeatherLookup) {
  const key = requireKey('OPENAI_API_KEY', 'replace-with-your-key');
  try { return createChatAgent(repository, createOpenAIClient(key), process.env.OPENAI_MODEL || 'gpt-4.1-mini', 'openai', weather); }
  catch { throw new ChatError(503, 'CHAT_NOT_CONFIGURED', 'The OpenAI SDK could not be initialized. Check installation and server configuration.'); }
}

function createLocalAgent(repository: AirportRepository, weather: WeatherLookup) {
  try { return createChatAgent(repository, createOllamaClient(process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434'), process.env.OLLAMA_MODEL || 'qwen3:4b', 'ollama', weather); }
  catch { throw new ChatError(503, 'CHAT_NOT_CONFIGURED', 'OLLAMA_BASE_URL must be a local HTTP origin.'); }
}

export function configureAgent(repository: AirportRepository, weather: WeatherLookup) {
  const provider = process.env.LLM_PROVIDER || 'gemini';
  if (provider === 'gemini') return createGeminiAgent(repository, weather);
  if (provider === 'openai') return createOpenAIAgent(repository, weather);
  if (provider === 'ollama') return createLocalAgent(repository, weather);
  throw new ChatError(503, 'CHAT_NOT_CONFIGURED', 'LLM_PROVIDER must be gemini, ollama or openai.');
}
