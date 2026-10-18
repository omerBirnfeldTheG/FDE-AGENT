# Airport Investment Intelligence Agent

## System flow

React/TypeScript → Express/TypeScript → agent tools → shared services → repositories and pure calculations.

The frontend displays demand rankings, supporting sources and chat. Selecting an airport also loads investment evidence/scenarios without an LLM call. Vite proxies `/api` to the local Express server. Conversation history stays in browser memory; failed turns are excluded. Server credentials never enter the frontend bundle.

## Data and provenance

- **Annual passengers:** `validation/refresh-faa-data.ts` downloads two official FAA PDFs, parses selected airport rows, reconciles overlapping reporting years, archives raw files with SHA-256, and atomically publishes a snapshot. The repository verifies archives and prefers that snapshot. Without a download it exposes the documented manual-extract fallback explicitly. Refresh requires backend restart. LAX, SFO and BOS only.
- **Weather:** NOAA Aviation Weather Center API, with National Weather Service station observations as fallback. Timed requests, a five-minute cache and request coalescing limit network work. Failed refresh may return explicitly stale cached observations; missing fields stay null. NWS units are converted; flight category is not invented. Weather is operational context, excluded from scores.
- **Investment evidence:** manually curated official public-document extracts contain source URL, section/page, period, scope, units, temporal basis and limitations. Investment originals are not archived. Gate counts, floor space and runway rates describe different constraints and cannot be silently equated. BOS includes a completed four-gate addition and historical planning/budget records; its partial budget is not a full current project cost.

Observed/reported facts, calculated values, planned infrastructure, estimates and assumptions remain distinct. No production synthetic data is used. Tests use explicit fixtures and mocks.

## Deterministic business logic

`domain/growth.ts` calculates annual growth. `domain/scoring.ts` maps growth to Demand Growth Score using `clamp(5 × (growthPercent + 10), 0, 100)`. The ±10% anchors are heuristic assumptions. Rankings sort unrounded scores descending and IATA codes ascending for ties. Missing values are unranked; mixed annual periods are rejected.

`services/investment-assessment.ts` joins growth and investment evidence. Its decision rule returns a demand signal, `due-diligence-required`, low confidence and explicit missing inputs. No profitability rank is produced without comparable utilization, delay statistics, incremental capacity and project cash flows. Existing modernization is not automatically an additional investment opportunity.

`domain/financial-scenario.ts` validates assumptions and calculates NPV, simple payback and break-even annual net cash flow. Illustrative cash-yield cases of 3%, 6% and 10% of reported project cost use 8% discount rate, 30 operating years and a three-year construction lag. All capital is paid at year zero. Cash flows are constant assumed net amounts; no tax, financing, inflation, residual value or overruns. Partial budgets are excluded. These scenarios are sensitivity illustrations, not predicted returns or cross-airport profitability rankings.

## Agent and safeguards

`POST /api/chat` validates message/history and uses a bounded tool loop. Gemini (default), OpenAI and local Ollama have narrow adapters to a common model interface. Official cloud SDKs translate function calls; Gemini model content/thought signatures and call IDs are preserved. No automatic paid-provider fallback or retry.

Tools retrieve growth, demand rankings, weather and investment assessment through the same services as GET routes. Each turn requires fresh tool evidence. The model selects an answer view and evidenced airport identifiers using a strict schema; a deterministic renderer writes figures, explanations and limitations. Model-authored numerical claims are not displayed. This trades unrestricted prose for traceability; intent/reference resolution still depends on model quality.

Errors produce safe client responses. Diagnostic logs include request IDs, provider/model, status, code, type, timing and sanitized messages, without prompts, raw responses, credentials or authorization headers. Keys exist only in server environment variables.

## Verification and one-day tradeoffs

Tests cover calculations, scoring boundaries, invalid/missing data, PDF ingestion, provider adapters, history, tool replay, evidence checks, sanitized logging, weather fallback/cache/unit conversions, financial scenarios and API serialization. Frontend type checking and production build are separate checks. Automated tests make no paid calls.

The user verified FAA PDF ingestion, a Gemini ranking response and live SFO NWS observations locally. This sandbox cannot bind localhost or resolve source hosts; browser end-to-end and fresh network installs require local verification. BTS exposes public delay data, but no comparable airport delay snapshot was imported. Terminal throughput/utilization, financial forecasts and later budget reconciliation remain gaps.

No database, deployment, voice interface or complex orchestration is needed for this prototype. The business value is explainable screening and visible due-diligence requirements, with explicit estimates rather than an unsupported investment winner.


## Code organization

Application and validation function bodies are at most six lines, checked by `scripts/check-readability.mjs`. The top-level application registers routes; HTTP handlers, provider configuration, chat input validation and answer templates are separate modules. The frontend separates layout, evidence components and state hooks. Shared airport validation, weather parsing, tool argument validation, source-link checks and financial assumption definitions prevent duplicated logic. Tests retain complete scenario bodies and are excluded from the length rule.
