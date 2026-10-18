import { createRequire } from 'node:module';

import type { ModelClient } from './model-client.ts';
export type { ModelClient, ModelItem, ModelRequest } from './model-client.ts';

// A narrow adapter keeps unit tests independent of SDK installation and network.
// Runtime uses the official npm `openai` package, not a handwritten HTTP client.
export function createOpenAIClient(apiKey: string, options: { fetch?: typeof fetch } = {}): ModelClient {
  const require = createRequire(import.meta.url);
  const { default: OpenAI } = require('openai');
  const client = new OpenAI({ apiKey, timeout: 20_000, maxRetries: 0, ...options });
  return { create: request => client.responses.create(request) };
}
