/** Log only allowlisted metadata; never serialize SDK errors, headers, or requests. */
export function sanitizeDiagnosticText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let text = value;
  const secrets = environmentSecrets();
  text = redactEnvironmentValues(text, secrets);
  text = redactPatterns(text);
  return text.slice(0, 1000);
}

export function getOpenAIFailureDiagnostic(error: unknown, model: string) {
  const value = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const body = value.error && typeof value.error === 'object' ? value.error as Record<string, unknown> : {};
  const networkCode = findNetworkCode(value.cause);
  return diagnosticFields(value, body, model, networkCode);
}

export function logOpenAIFailure(error: unknown, model: string) {
  console.error(JSON.stringify(getOpenAIFailureDiagnostic(error, model)));
}

function environmentSecrets() {
  return Object.entries(process.env)
    .filter(([name, secret]) => /KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH|OPENAI_(ORG|PROJECT)_ID/i.test(name) && secret)
    .map(([, secret]) => secret!)
    .sort((a, b) => b.length - a.length);
}

function redactPatterns(text: string) {
  return redactCredentials(redactTokens(redactLinks(text)));
}

function redactLinks(text: string) {
  return text
    .replace(/-----BEGIN[^]*?-----END[^\n]*-----/g, '[REDACTED]')
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[URL REDACTED]')
    .replace(/\b(?:Bearer|Basic)\s+[a-z0-9+/=._*-]+/gi, '[REDACTED]');
}

function redactTokens(text: string) {
  return text
    .replace(/\bsk-[a-z0-9._*-]+/gi, '[REDACTED]')
    .replace(/\bAIza[A-Za-z0-9_-]+/g, '[REDACTED]')
    .replace(/\beyJ[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+/gi, '[REDACTED]');
}

function redactCredentials(text: string) {
  return text
    .replace(/(?:authorization|proxy-authorization|api[_ -]?key|access[_ -]?token|password|secret|credential)["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\r\n,}]+)/gi, '[CREDENTIAL REDACTED]')
    .replace(/[\r\n\t\x00-\x1f\x7f]/g, ' ');
}

function redactEnvironmentValues(text: string, secrets: string[]) {
  for (const secret of secrets) {
    for (const encoded of [secret, encodeURIComponent(secret)]) text = text.split(encoded).join('[REDACTED]');
  }
  return text;
}

function findNetworkCode(cause: unknown) {
  let networkCode: unknown = null;
  for (let depth = 0; depth < 4 && cause && typeof cause === 'object'; depth++) {
    const nested = cause as Record<string, unknown>;
    networkCode = nested.code ?? networkCode; cause = nested.cause;
  }
  return networkCode;
}

function diagnosticFields(value: Record<string, unknown>, body: Record<string, unknown>, model: string, networkCode: unknown) {
  return {
    event: 'openai_request_failed', model: sanitizeDiagnosticText(model),
    httpStatus: typeof value.status === 'number' && Number.isInteger(value.status) ? value.status : null,
    errorCode: sanitizeDiagnosticText(value.code ?? body.code), errorType: sanitizeDiagnosticText(errorType(value, body)),
    networkCode: sanitizeDiagnosticText(networkCode), message: sanitizeDiagnosticText(value.message ?? body.message) ?? 'No provider error message available.'
  };
}

function errorType(value: Record<string, unknown>, body: Record<string, unknown>) {
  const fallback = typeof value.name === 'string' && value.name !== 'Error' ? value.name : typeof value.constructor === 'function' ? value.constructor.name : value.name;
  return value.type ?? body.type ?? fallback;
}
