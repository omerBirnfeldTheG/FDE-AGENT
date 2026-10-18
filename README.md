# Airport Investment Intelligence Agent — data and demand growth API

The application includes a React + TypeScript analyst workspace and an Express + TypeScript API for the previously validated LAX, SFO, and BOS snapshot, a deterministic Demand Growth Score, and tool-calling chat. Gemini is the selected default provider; Ollama and OpenAI remain optional.

## Run

Requires Node.js 24 or later; Node runs TypeScript directly.

```sh
npm ci
npm run typecheck
npm test
npm start
```

In a second terminal:

```sh
curl http://127.0.0.1:3000/api/airports/LAX/growth
curl http://127.0.0.1:3000/api/airports/rankings
node backend/http-smoke.ts
```

`PORT` defaults to 3000. The server binds to 127.0.0.1.

## Analyst workspace

If frontend dependencies have not been installed yet:

```sh
npm run setup:frontend
```

This installs React, React DOM, Vite and React type declarations, saving them in the manifest and lockfile. On subsequent checkouts, use `npm ci` once these dependencies have been recorded.

Run the backend in one terminal:

```sh
npm start
```

Run the frontend in another:

```sh
npm run dev:frontend
```

Open http://127.0.0.1:5173. Vite proxies `/api` to the backend at http://127.0.0.1:3000. If you change the backend port, update both proxy targets in `frontend/vite.config.ts`. No API key belongs in frontend configuration; Vite uses a separate environment directory and does not load the root server `.env`.

The interface offers:

- Demand Growth Score rankings from the backend, with underlying counts and FAA sources on selecting an airport.
- Chat, suggested questions and multi-turn context for follow-ups such as “How does it compare to LAX?”
- Expandable tool evidence, methodology, observed/calculated labels and coverage limitations.
- Independent data/chat error states, explicit manual retry, pending indicators and a new-conversation control.

The browser keeps chat only in memory. Refreshing clears it. The API receives recent successful exchanges within its history-size limits; failed requests are excluded from context. No automatic chat retry or background model request is made. Rankings load without invoking an AI provider.

Build and preview locally:

```sh
npm run build:frontend
npm run preview:frontend
```

The build writes `frontend/dist` (gitignored). Preview still needs the backend running for API calls. There is no deployment or production web-server configuration in this step.

Frontend API tests mock fetch to verify follow-up history, backend error display, response validation and conversation-size limits; `npm test` runs them with the backend suite without paid API requests.

## API

### Public aviation weather API

`GET /api/airports/:iata/weather` retrieves recent weather for LAX, SFO or BOS without calling an LLM. The agent tool `get_airport_weather` uses the same lookup. Weather is operational context only and does not affect the Demand Growth Score or measure congestion/capacity.

Primary source: `https://aviationweather.gov/api/data/metar?ids=KSFO&format=json`. On an error, invalid response or absent report, the backend tries the official NWS alternative: `https://api.weather.gov/stations/KSFO/observations/latest`. The source actually used is recorded in the response. The NWS API is public and free; it requires an identifying User-Agent header, supplied by the adapter. Documentation: https://www.weather.gov/documentation/services-web-api.

NWS quantitative values are converted according to their source unit codes (km/h or m/s to knots; metres to statute miles). Unknown units and missing values remain unavailable. NWS flight category is not inferred and remains null. Observed timestamps are checked, and reports older than two hours are labeled stale.

Successful observations are cached for five minutes. Failures are cached briefly to avoid repeated calls; concurrent lookups are coalesced. On failed refresh, an observation less than 24 hours old may be returned explicitly as `stale-cache`, with its original observation/source timestamp. Never treat stale-cache data as current conditions. Both sources failing returns `availability: unavailable`, with no fabricated values. No API keys are needed, and the weather request does not consume Gemini quota.

After restarting the backend, verify locally:

```sh
curl http://127.0.0.1:3000/api/airports/SFO/weather
```

Look for `availability: available`, the observation timestamp, and the actual `source.url`. Safe `weather_api_failed` server logs expose which provider failed, HTTP status, network code and a sanitized message. No raw provider payloads or credentials are logged. The user verified live NWS retrieval locally for SFO on October 13, 2026; mocked transport tests cover fallback, conversion, caching and errors.

`GET /api/airports/:iata/growth` returns annual passenger enplanements, unrounded calculated growth, source URLs/reporting years/publication dates, and snapshot limitations. Airport codes are case insensitive and must contain three ASCII letters.

- 200: available data.
- 400 `INVALID_AIRPORT_CODE`: malformed code.
- 404 `AIRPORT_DATA_NOT_FOUND`: valid code format but absent from the snapshot; this does not assert that the airport does not exist.
- 422 `INSUFFICIENT_DATA`: fewer than two observations or a missing count. No imputation.
- A zero baseline makes percentage growth undefined and returns `null` with a reason.

## Demand Growth Score

`GET /api/airports/rankings` returns ranked airports, raw annual enplanements and growth, source references, methodology version, and coverage limitations. Missing data is listed separately in `unranked` with `score: null` and a reason. Different reporting periods are rejected rather than compared silently.

The only scored KPI is verified annual passenger enplanement growth. Methodology `demand_growth`, version `1.0.0`, uses fixed linear normalization:

```text
growthPercent = (currentEnplanements - previousEnplanements) / previousEnplanements * 100
score = min(100, max(0, 100 * (growthPercent + 10) / 20))
```

Thus -10% maps to 0, -5% to 25, 0% to 50, +5% to 75, and +10% to 100. Inputs are percentage values: 5 means 5%. The -10%/+10% anchors are heuristic prototype assumptions, not FAA thresholds or empirically calibrated benchmarks. Fixed anchors make scores independent of which other airports are present. Values outside the anchors are clipped and may tie. Ranks use unrounded scores descending, then IATA codes ascending for ties; ranks are ordinal positions. API values retain full precision; round only for display.

Passenger growth alone proves neither terminal expansion need nor financial profitability. Zero growth scoring 50 does not imply an attractive investment. Capacity, congestion, financial outcomes, absolute market size, and existing expansion projects are not scored. Missing values are not estimated or assigned zero. Zero baseline growth is undefined and remains unranked.

Example (2024 to 2025): SFO 4.6768% / score 73.3838; BOS -0.3299% / score 48.3507; LAX -3.3461% / score 33.2693. A full response generated by the Express route is saved in `backend/example-rankings.json`.

## Data provenance

### Refresh from original FAA PDFs

The supplied FAA URL is an annual PDF report, not a JSON API. The backend now supports a reproducible original-file importer rather than copying browser extracts into code. It downloads the linked CY2024 report and the CY2025 report, preserving the existing 2024→2025 scoring period and three-airport scope.

First install the PDF.js parser (requires a network-enabled terminal):

```sh
npm run setup:data
```

Then download, parse and validate the original reports:

```sh
npm run refresh:data
npm start
```

Stop any previous backend process before restarting. The importer writes `validation/downloaded-snapshot.json` only after both publications pass validation, and archives original PDF bytes under `validation/raw/` with SHA-256 hashes in their filenames. Both are ignored local cache files. Failed downloads or parsing preserve the previous snapshot; they never replace missing data with estimates. The original documented snapshot remains the fallback when no downloaded cache exists. If a downloaded cache is present but its archives are missing or checksums do not match, loading fails rather than misrepresenting its provenance.

Checks include allowlisted FAA HTTPS URLs, a 30-second timeout per download, a 10 MiB file-size limit, PDF magic bytes, actual report-year headers, exactly one LAX/SFO/BOS row, valid counts and reconciled FAA percentages, and agreement on 2024 counts across publications. Redirects are rejected; update source configuration if FAA moves a file. The parser is deliberately scoped to these three large primary airports and the current report format; changed layouts fail visibly. Source publication dates and titles remain documented metadata from the FAA source pages.

GET growth/rankings and chat all use the same repository. After a successful refresh and backend restart, their provenance mode is `official-pdf-download`, and each source includes `downloadedAt` and `sha256`. Counts are parsed from the original reports; responses use this cache, not a new FAA download on every chat turn. Chat and frontend acquisition warnings switch according to the actual loaded mode. Annual public reports are not real-time passenger data.

Verify the loaded mode without invoking an LLM:

```sh
curl http://127.0.0.1:3000/api/airports/LAX/growth
```

Local DNS resolution to `www.faa.gov` failed in the implementation sandbox, so live download and original-file parsing remain unverified here. Import tests use the previously verified FAA text as fixtures and mocked download transport, including rejection of changed years, duplicated/missing rows, HTML responses, wrong percentages and overlapping-year discrepancies. No original-file import success is claimed until `refresh:data` completes on a network-enabled host.

Source PDF references were rechecked through the browser on 2026-10-10:

| Reporting year | Publication date | Official source |
|---|---|---|
| 2024 | 2025-09-15 | https://www.faa.gov/sites/faa.gov/files/2026-09/arp-cy2024-commercial-service-enplanements.pdf |
| 2025 | 2026-09-24 | https://www.faa.gov/airports/planning_capacity/passenger_allcargo_stats/passenger/arp-cy2025-commercial-service-enplanements.pdf |

The API consumes `validation/results.json` and source metadata from `validation/faa-extracts.json`. Counts are reported observations; growth is calculated on every request. Reporting periods are calendar years. Enplanements count boardings, not arrivals plus departures or unique travelers.

The implementation sandbox cannot resolve FAA DNS. The user successfully ran the original PDF importer locally on October 13, 2026. A fresh checkout without downloaded files uses the explicitly labeled manual-extract fallback and covers only three airports. It is not refreshed automatically. The 2025 commercial-service link opens an all-airports-by-state report; its column headings were checked. The 2024 counts agree across both publications. See `validation/README.md` for the original validation record.

## Verification limitations

Dependencies were installed from cached official npm packages. Type checking and tests exercise calculations, snapshot responses for all three airports, provenance, invalid codes, absent airports, and incomplete observations. API tests dispatch real Express routes and serialization in process without opening sockets.

This execution sandbox prohibits localhost socket binding (`listen EPERM`), so a listening HTTP server could not be verified here. The separately supplied `backend/http-smoke.ts` checks actual HTTP responses after starting the server in a normal terminal. Do not interpret in-process tests as a successful network smoke check.

## Gemini chat (default)

The official `@google/genai` SDK is installed and recorded in the manifest/lockfile. For a fresh checkout, `npm ci` installs it. Set these values privately in your existing `.env`:

```dotenv
LLM_PROVIDER=gemini
GEMINI_API_KEY=your_actual_gemini_key
GEMINI_MODEL=gemini-3.1-flash-lite
```

Replace the key placeholder only in `.env`, which is gitignored. Restart using `npm start` after edits. Existing exported environment variables override the file. Keep credentials server-side; never pass them to `/api/chat` or put them in `.env.example`.

Google documents the exact model as stable and supporting function calling and structured output, with Standard free-tier input/output usage subject to project quotas. Free-tier eligibility for your key has not been verified. No billing changes or provider fallback are performed. Free-tier submitted data may be used to improve Google's products.

Sources checked 2026-10-12:

- https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite
- https://ai.google.dev/gemini-api/docs/pricing
- https://googleapis.github.io/js-genai/release_docs/interfaces/types.FunctionDeclaration.html

The adapter calls `GoogleGenAI.models.generateContent`. First it sends function declarations with mode `ANY`; the existing services execute requested tools. It replays complete model content, including thought signatures, and function responses with matching names/native IDs. Next it requests the existing JSON answer-selection schema, which the deterministic renderer turns into natural-language replies with verified facts and sources. This preserves safeguards against invented figures and unsupported investment conclusions. Follow-up history maps assistant turns to Gemini's model role. Multiple tool results are grouped into one user turn. Requests have a 30-second timeout and one SDK attempt (no automatic retries).

Gemini failures return `GEMINI_UNAVAILABLE`; missing key or SDK returns `CHAT_NOT_CONFIGURED`. Server-side diagnostics sanitize credentials and report status/code/type. Quota failures and unavailable models never trigger paid fallback or repeated requests.

Run and test locally:

```sh
npm start
```

In another terminal, submit one chat request:

```sh
curl -i http://127.0.0.1:3000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"Why is SFO ranked first?","history":[]}'
```

A successful turn normally makes two Gemini model requests (tool selection and final answer). Mocked tests verify the loop, follow-up comparisons, thought-signature replay, multi-call results, invalid airports, quota failures and rejection of invented fields. SDK initialization has been checked without network access. The user verified a live Gemini ranking response locally. Provider availability is variable (a subsequent request returned 503); automated tests use mocks.

## Free local chat with Ollama (optional)

Install Ollama from https://ollama.com/download and start its application, or run `ollama serve` in a terminal. Download the tool-capable Qwen3 model:

```sh
ollama pull qwen3:4b
```

Add these settings to your existing `.env` (do not overwrite credentials):

```dotenv
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3:4b
```

Restart the backend with `npm start`, then use the same `/api/chat` requests below. No API key or API credits are needed for local inference. There is no automatic fallback to OpenAI. Model download requires internet and disk space; inference consumes local memory and compute. This project's configuration permits only local HTTP origins and rejects redirects, keeping chat requests on the local machine.

The adapter uses Ollama's native `/api/chat` endpoint. First it supplies tool definitions; after tool results, it requests the schema-constrained final selection. It translates messages and tool results to the existing agent contract, preserving the deterministic renderer and scoring functions. Thinking and streaming are disabled, and each local request has a five-minute timeout to allow slower hardware. The existing four-round/six-tool limits still apply. Local provider failures return `OLLAMA_UNAVAILABLE` and sanitized diagnostics with event `ollama_request_failed`.

The CLI was not found in the implementation environment, so real local inference remains unverified. Mocked transport tests verify native tool translation, follow-up context, evidence replay, schema selection, failure behavior, and that model answers cannot bypass required evidence. A smaller model may select tools or resolve references less reliably; invalid outputs fail safely rather than becoming aviation claims.

References: https://docs.ollama.com/capabilities/tool-calling and https://ollama.com/library/qwen3:4b.

## Optional OpenAI chat configuration

```sh
npm install
# Create .env from .env.example only if it does not already exist.
# Set LLM_PROVIDER=openai and OPENAI_API_KEY in your existing .env.
npm start
```

Node loads `.env` at startup; externally provided environment variables take precedence. `.env` and `.env.*` are gitignored except the placeholder `.env.example`. The SDK reads the key only from the server's `OPENAI_API_KEY` environment variable. No key is accepted in API requests. `OPENAI_MODEL` defaults to `gpt-4.1-mini`; use an account-accessible model supporting Responses API function calling and structured outputs.

The official `openai` Node SDK dependency is pinned to 6.0.0 and is now installed. Tests verify actual SDK request serialization and provider-error handling through a mocked fetch transport, without network calls. A single live diagnostic attempt failed before receiving an HTTP response with network cause `ENOTFOUND` in this sandbox; provider authentication, quota, and live schema acceptance remain unverified here.

The API/function calling design follows official documentation:

- https://developers.openai.com/api/docs/libraries
- https://developers.openai.com/api/docs/guides/function-calling
- https://developers.openai.com/api/docs/guides/structured-outputs

## POST /api/chat

```sh
curl http://127.0.0.1:3000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"Why is SFO ranked first?","history":[]}'
```

Follow-up request:

```json
{
  "message": "How does it compare to LAX?",
  "history": [
    { "role": "user", "content": "Why is SFO ranked first?" },
    { "role": "assistant", "content": "SFO ranks first under the passenger-growth-only score in our validated dataset." }
  ]
}
```

The response includes `reply`, `evidence` (actual tool results and source references), `coverage`, `answerMode`, configured `model`, and `provider`. Clients retain user/assistant history and submit it on each turn. There is no server-side conversation database. Historical assistant messages are untrusted context; fresh tool evidence is required each turn.

Tools `get_airport_growth(iata)` and `get_demand_growth_rankings()` call the same shared services as the GET endpoints. The model selects tools and an answer type; the server renders all factual prose from verified tool outputs. The structured final selection accepts only `view` and `iatas`, not model-authored figures or investment conclusions. Invalid selections or references without evidence are rejected. This intentionally limits answer expressiveness to growth, rankings, comparisons, methodology, and unavailable-data explanations. It prevents fabricated numerical claims in replies, but does not guarantee that the model always resolves user intent correctly.

Every successful reply states that only LAX, SFO, and BOS are covered and that passenger growth proves neither expansion need nor financial profitability. Source limitations remain in evidence and coverage. A mocked comparison example is saved as `backend/example-chat.json`; it is not a recorded live OpenAI response.

Input limits: 4000 characters per message, at most 20 user/assistant history entries, 24000 total conversation characters, 32kb JSON body. System/tool roles are rejected. The loop allows at most four model requests and six tool calls; SDK requests time out after 20 seconds with retries disabled and `store: false`. Conversation context and tool results are sent to OpenAI when live chat is enabled; `store: false` is not a claim of zero provider retention.

Errors: 400 invalid input/JSON, 413 oversized body, 503 missing server configuration or SDK, 502 provider failure, incomplete response, invalid answer selection, or exhausted loop. Provider errors are sanitized. Invalid airport codes and absent/missing airport data are returned as tool errors and explained in a successful unavailable-data reply when the model selects that view. Existing growth/ranking endpoints remain available without an API key.

`npm test` uses mocked LLM responses and exercises tool outputs, comparison follow-ups, input validation, missing data, rejection of invented fields and unsupported airport references, provider failures, and bounded loops. No real API key or network calls are required.

## Diagnose OpenAI failures

Chat flow logging applies to all providers. The server generates an `X-Request-ID` for each chat request and records stage events for input validation, provider/model selection, each model round, tool execution, answer validation, and completion/failure. Events include durations and counts, never user messages, history, tool arguments/results, model text, or request headers. Provider failures retain sanitized status/code/type/message and the same request ID. The frontend displays the request ID on an API failure so it can be matched to server logs. Restart the backend after updating this code. There are no automatic retries or additional paid diagnostic requests.

Restart the backend after changing code or `.env`. `npm start` / `npm run dev` load `.env`; starting `node backend/server.ts` directly does not load that file. Existing shell environment values override `.env` values. The current agent/client is initialized once per running application, so restart after changing the key or model.

On a provider failure, the server prints one JSON diagnostic with `event: openai_request_failed`, `httpStatus`, `errorCode`, `errorType`, `networkCode`, configured model, and sanitized message. Raw errors, stacks, headers, requests, and provider bodies are never serialized by this logger. Known environment credentials, API-key patterns, bearer/basic tokens, JWTs, credential fields, URLs and multiline control characters are redacted. Client-facing errors remain generic.

Use the next failed request's server log to identify the cause:

| Diagnostic | Fix |
|---|---|
| `networkCode: ENOTFOUND`, status null | DNS resolution failed before an HTTP response. Check outbound network/DNS, proxy configuration and any `OPENAI_BASE_URL` override in the server's execution environment. |
| 401 / `invalid_api_key` | Correct the server's key and restart. Verify a stale exported key is not overriding `.env`. |
| 429 / `insufficient_quota` | Check API billing/credit and project usage limits for the key's project. |
| 429 / rate limit code | Reduce request rate or wait; SDK automatic retries are disabled. |
| 404 / `model_not_found` | Check model spelling and access for the key's project. |
| 400 / invalid parameter or schema | Read the sanitized message identifying the rejected field; verify the model supports Responses function calling and structured outputs. |

`gpt-4.1-mini` supports Responses, function calling and structured outputs according to https://developers.openai.com/api/docs/models/gpt-4.1-mini. Current request fields use Responses `text.format` with strict JSON schema, not Chat Completions `response_format`. Every schema property is required and objects disallow additional properties. Static/transport checks do not establish project-specific model access or provider acceptance.

### Investment evidence (first data layer)

`GET /api/airports/SFO/investment-evidence` returns curated public-document facts for LAX, SFO, or BOS. Each record carries its scope, units, temporal basis, reporting period, source URL, and section/PDF-page locator. PDF page numbers are one-based file pages, distinct from printed report pages.

This initial layer includes LAX gate inventory, Terminal 5 estimated cost and separate appropriation, an airfield bottleneck and rounded airport operating revenue; SFO planned Terminal 3 West floor area and announced budget plus approximate weather-dependent runway arrival rates; and BOS's historical 2018 Terminal E plan and partial budget. BOS records are historical planning evidence, not current capacity or total project cost. SFO's announcement warns it may be outdated. No claim of comprehensive or current coverage is made.

The investment documents were reviewed through public web extracts, not downloaded by `refresh:data`; that command refreshes FAA passenger data only. Investment facts are maintained in `backend/data/investment-evidence.ts`. Original investment documents are not yet archived/checksummed. Validate later revisions before relying on a budget. No direct cross-airport cost ranking is meaningful across these different scopes and periods.

Project NPV, IRR and payback remain null because project-specific incremental cash flows have not been validated. Airport revenue is not project profitability. Comparable delay rates, terminal throughput capacity and utilization remain gaps. The investment assessment tool and frontend now expose these records and estimated scenarios; the Demand Growth Score is unchanged. Subsequent work must validate comparable KPI coverage and implement an explicitly assumed financial scenario before an investment ranking is defensible.

Local example after restarting the backend:

```sh
curl http://127.0.0.1:3000/api/airports/SFO/investment-evidence
```


## Investment assessment and submission demo

`GET /api/airports/:iata/investment-assessment` combines sourced investment records with passenger growth and pure financial scenario calculations. `get_investment_assessment(iata)` gives the agent the same service; the verified renderer produces the response. Select an airport in the UI and expand **Investment evidence and scenarios**, or ask “Assess SFO terminal investment costs and financial scenarios.”

This prototype does not force a profitability ranking from incomparable project budgets. The deterministic assessment returns `due-diligence-required`, a positive/nonpositive demand signal, low confidence, explicit missing inputs, and no investment rank. Demand Growth Score remains the only ranked verified KPI. Gate inventory and floor area are infrastructure descriptors, not proof of unused or exhausted passenger capacity. Runway constraints do not establish a terminal-expansion case.

Financial scenarios use a reported full-project cost where available (LAX Terminal 5 and SFO Terminal 3 West). Illustrative constant annual incremental net cash flows are 3%, 6%, and 10% of that cost. These are **assumptions**, not predicted airport revenue. Discount rate is 8%, operating horizon 30 years, construction lag 3 years, and all capital is paid at year zero. NPV, undiscounted payback and break-even annual cash flow are calculated deterministically. There are no tax, debt, inflation or terminal value assumptions. BOS has only a dated partial budget, so no scenario is generated. Observed project returns remain unavailable for every airport.

The business conclusion is intentionally conditional: growth can prioritize investigation; confirmed terminal bottlenecks and incremental financial benefits are needed before recommending construction. Comparable BTS delay statistics could improve operational screening, but BTS downloads were inaccessible from this sandbox (DNS failure), and no unverified delay figures are inserted. BOS historical project records also need later scope/budget reconciliation. Those are identified data gaps, not modeled observations.

Recommended demo:
1. Ask “Rank the airports by passenger growth.”
2. Follow with “Why is SFO first?” and “How does it compare to LAX?”
3. Ask “Assess SFO terminal investment costs and financial scenarios.” Inspect dated sources and assumed cash flows.
4. Ask “Compare the terminal investment evidence for SFO and LAX.”
5. Ask “What about BOS?” Note partial budget and missing financial scenario.
6. Ask “What is the current weather at SFO?” This invokes an actual NOAA public API.
7. Ask about JFK or guaranteed profits. The response must preserve coverage and uncertainty.

Checks: `npm test`, `npm run typecheck`, `npm run build:frontend`. Start backend and frontend in separate terminals with `npm start` and `npm run dev:frontend`. No paid model calls are part of tests. Never include `.env` or `node_modules` in submission. Commit source, lockfile, README, ARCHITECTURE.md and documented fallback snapshots. Downloaded FAA archives are ignored: the evaluator can reproduce them with `npm run refresh:data`.

For a plain-language walkthrough and presentation notes, see [PROJECT_GUIDE.md](PROJECT_GUIDE.md). TypeScript checks also reject unused local variables and parameters in backend and frontend source.


### Readability and organization

Run `npm run check:readability` to enforce the six-line function-body limit in application and validation code. Test scenarios are excluded. HTTP concerns live in `backend/http`, answer templates in `backend/agent/answers`, weather parsing in `backend/data/weather-parsing.ts`, and screen components/hooks in `frontend/src/components` and `frontend/src/hooks`. See PROJECT_GUIDE.md for the plain-language walkthrough.
