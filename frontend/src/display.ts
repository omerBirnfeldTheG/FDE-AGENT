export const airportNames: Record<string, string> = { SFO: 'San Francisco', BOS: 'Boston Logan', LAX: 'Los Angeles' };
export const count = (value: number | null) => value === null ? 'Unavailable' : value.toLocaleString('en-US');
export const percent = (value: number | null) => value === null ? 'Unavailable' : `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
export const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';

export function officialSource(url: string, hosts: string[]) {
  try { const parsed = new URL(url); return parsed.protocol === 'https:' && hosts.includes(parsed.hostname); }
  catch { return false; }
}
