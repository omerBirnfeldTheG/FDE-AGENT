import { sanitizeDiagnosticText } from './diagnostics.ts';

type Fields = {
  requestId: string; provider?: string; model?: string; round?: number;
  durationMs?: number; historyEntries?: number; messageCharacters?: number;
  toolCount?: number; tool?: string; resultKind?: string; errorCode?: string;
  httpStatus?: number; outputStatus?: string;
};
export function logChatFlow(event: string, fields: Fields) {
  const safe: Record<string, unknown> = { event, timestamp: new Date().toISOString() };
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === 'string') safe[key] = sanitizeDiagnosticText(value);
    else if (typeof value === 'number' && Number.isFinite(value)) safe[key] = value;
  }
  console.info(JSON.stringify(safe));
}
