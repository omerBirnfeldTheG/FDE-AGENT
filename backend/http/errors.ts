import type { Request, Response, NextFunction } from 'express';
import { ChatError } from '../agent/chat-error.ts';
import { DataError } from '../services/airport-growth.ts';

function sendError(res: Response, status: number, code: string, message: string) {
  res.status(status).json({ error: { code, message } });
}

function handleParserError(error: unknown, res: Response) {
  const type = (error as { type?: string })?.type;
  if (type !== 'entity.parse.failed' && type !== 'entity.too.large') return false;
  sendError(res, type === 'entity.too.large' ? 413 : 400, 'INVALID_JSON_BODY', 'Provide valid JSON within the 32kb body limit.');
  return true;
}

export function handleError(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof DataError || error instanceof ChatError) return sendError(res, error.status, error.code, error.message);
  if (handleParserError(error, res)) return;
  console.error('Unexpected server error; request could not be processed.');
  sendError(res, 500, 'INTERNAL_ERROR', 'Unable to process the request.');
}

export function handleUnknownRoute(_req: Request, res: Response) {
  sendError(res, 404, 'ROUTE_NOT_FOUND', 'Route not found.');
}
