import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { ChatError, validateChatInput } from '../agent/chat.ts';
import type { ChatAgent } from '../agent/chat.ts';
import { logChatFlow } from '../agent/flow-logs.ts';
type Context = { requestId: string; started: number };

function startRequest(res: Response): Context {
  const requestId = randomUUID();
  res.setHeader('X-Request-ID', requestId);
  logChatFlow('chat_request_received', { requestId });
  return { requestId, started: Date.now() };
}

async function answerRequest(req: Request, res: Response, getAgent: () => ChatAgent, context: Context) {
  const input = validateChatInput(req.body);
  logChatFlow('chat_input_validated', { requestId: context.requestId, historyEntries: input.history.length, messageCharacters: input.message.length });
  const result = await getAgent()(input, { requestId: context.requestId });
  logChatFlow('chat_request_completed', { requestId: context.requestId, durationMs: Date.now() - context.started, httpStatus: 200 });
  res.json(result);
}

function failRequest(error: unknown, next: NextFunction, context: Context) {
  const httpStatus = error instanceof ChatError ? error.status : 500;
  const errorCode = error instanceof ChatError ? error.code : 'INTERNAL_ERROR';
  logChatFlow('chat_request_failed', { requestId: context.requestId, durationMs: Date.now() - context.started, httpStatus, errorCode });
  next(error);
}

export function createChatHandler(getAgent: () => ChatAgent) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const context = startRequest(res);
    try { await answerRequest(req, res, getAgent, context); }
    catch (error) { failRequest(error, next, context); }
  };
}
