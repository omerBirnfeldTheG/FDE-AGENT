import { ChatError } from './chat-error.ts';
export type ChatInput = { message: string; history: { role: 'user' | 'assistant'; content: string }[] };

function rejectInput(message: string): never {
  throw new ChatError(400, 'INVALID_CHAT_INPUT', message);
}

function validateMessage(value: Record<string, unknown>) {
  const extraKeys = Object.keys(value).some(key => !['message', 'history'].includes(key));
  const message = value.message;
  if (extraKeys || typeof message !== 'string' || !message.trim() || message.length > 4000)
    rejectInput('message must contain 1–4000 characters; only message and history are accepted.');
  return message as string;
}

function validateHistoryEntry(entry: any) {
  const validFields = entry && typeof entry === 'object' && Object.keys(entry).every(key => ['role', 'content'].includes(key));
  const validContent = typeof entry?.content === 'string' && entry.content.trim() && entry.content.length <= 4000;
  if (!validFields || !validContent || !['user', 'assistant'].includes(entry.role))
    rejectInput('History entries require user/assistant role and 1–4000 characters of content.');
}

function validateHistory(history: unknown, message: string): ChatInput['history'] {
  if (!Array.isArray(history) || history.length > 20) rejectInput('history must contain at most 20 messages.');
  history.forEach(validateHistoryEntry);
  const size = history.reduce((total, entry) => total + entry.content.length, message.length);
  if (size > 24000) rejectInput('Conversation exceeds 24000 characters.');
  return history;
}

export function validateChatInput(body: unknown): ChatInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) rejectInput('Expected a JSON object.');
  const value = body as Record<string, unknown>;
  const message = validateMessage(value);
  return { message: message.trim(), history: validateHistory(value.history ?? [], message) };
}
