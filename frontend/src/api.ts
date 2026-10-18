export type Source = { reportingYear: number; publicationDate: string; title: string; url: string; downloadedAt?: string; sha256?: string };
export type Observation = { year: number; enplanements: number | null; evidenceType: string };
export type AirportEvidence = {
  iata: string;
  rank?: number | null;
  score?: number | null;
  observations: Observation[];
  yearOverYear: { fromYear: number | null; toYear: number | null; change: number | null; growthPercent: number | null; unavailableReason: string | null };
  sources: Source[];
};
export type Rankings = {
  metric: string;
  rankings: AirportEvidence[];
  unranked: AirportEvidence[];
  methodology: { version: string; normalization: string; assumptions: string[]; rankingRule: string };
  coverage: { datasetAirportCount: number; limitations: string[] };
  dataSnapshot: { mode: string; capturedOn: string; sourceReferencesVerifiedOn: string; limitations: string[] };
};
export type ChatResponse = {
  reply: string;
  provider: string;
  model: string;
  answerMode: string;
  evidence: ({ kind: 'investment'; data: InvestmentAssessment } | { kind: 'weather'; data: WeatherEvidence } | { kind: 'growth'; data: AirportEvidence } | { kind: 'rankings'; data: Rankings } | { kind: 'error'; error: { code: string; message: string } })[];
  coverage: { airports: string[]; limitations: string[] };
};
export type HistoryMessage = { role: 'user' | 'assistant'; content: string };
export type WeatherEvidence = {
  iata: string; icao: string; availability: string; freshness: string; observationStale: boolean | null;
  observation: null | { observedAt: string; rawMetar: string; windSpeedKnots: number | null; windGustKnots: number | null; visibilityStatuteMiles: string | number | null; flightCategory: string | null };
  source: { name: string; url: string; documentationUrl: string; retrievedAt: string | null };
  unavailableReason: string | null; limitations: string[];
};

function requestError(response: Response, body: any) {
  const requestId = response.headers.get('X-Request-ID');
  const reference = requestId && /^[a-f0-9-]{36}$/i.test(requestId) ? ` Request ID: ${requestId}` : '';
  return new Error((body?.error?.message || `Request failed (HTTP ${response.status}).`) + reference);
}

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw requestError(response, body);
  if (!body || typeof body !== 'object') throw new Error('The backend returned an unexpected response.');
  return body as T;
}

function explainRequestFailure(error: unknown): never {
  if (error instanceof DOMException && error.name === 'AbortError') throw new Error('The request timed out. The server may still be working; check its terminal before retrying.');
  if (error instanceof TypeError) throw new Error('Cannot reach the backend. Start it with npm start, then try again.');
  throw error;
}

async function apiRequest<T>(path: string, options: RequestInit, timeout: number): Promise<T> {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout);
  try { return await readResponse<T>(await fetch(path, { ...options, signal: controller.signal })); }
  catch (error) { return explainRequestFailure(error); }
  finally { clearTimeout(timer); }
}

// Backend accepts up to 20 entries / 24,000 characters, 4,000 per entry.
export function boundedHistory(history: HistoryMessage[], message: string): HistoryMessage[] {
  if (message.length > 4000) throw new Error('Message must contain at most 4000 characters.');
  const recent = history.slice(-20).map(entry => ({ ...entry, content: entry.content.slice(0, 4000) }));
  while (recent.reduce((total, entry) => total + entry.content.length, message.length) > 24000) recent.splice(0, 2);
  return recent;
}

export async function getRankings(): Promise<Rankings> {
  const result = await apiRequest<Rankings>('/api/airports/rankings', {}, 15000);
  if (!Array.isArray(result.rankings) || !Array.isArray(result.unranked) || !result.methodology || !result.coverage || !result.dataSnapshot) throw new Error('Rankings data is incomplete.');
  return result;
}
export async function sendMessage(message: string, history: HistoryMessage[]): Promise<ChatResponse> {
  const result = await apiRequest<ChatResponse>('/api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history: boundedHistory(history, message) })
  }, 1260000);
  if (typeof result.reply !== 'string' || !Array.isArray(result.evidence) || !result.coverage) throw new Error('The chat response is incomplete.');
  return result;
}

export type InvestmentAssessment = {
  iata: string;
  facts: { metric: string; value: number | string; unit: string; scope: string; temporalBasis: string; limitations: string[]; source: { url: string; title: string; reportingPeriod: string; locator: string } }[];
  financialScenarios: { name: string; npv: number; simplePaybackYearsFromInvestment: number | null; breakEvenAnnualCashFlow: number; assumptions: { capitalCost: number; annualIncrementalCashFlow: number; discountRate: number; operatingYears: number; constructionYears: number } }[];
  assessment: { decision: string; confidence: string; rationale: string[]; readiness: { missingInputs: string[] } };
  limitations: string[];
};
