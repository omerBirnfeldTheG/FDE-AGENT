# Airport Investment Intelligence Agent — Design & Architecture

## Purpose and scope

This one-day prototype helps analysts screen airport demand and investigate terminal investment opportunities. It covers **LAX, SFO and BOS**. It provides a reproducible demand ranking, sourced project evidence and illustrative financial scenarios. It does not establish which expansion will be most profitable.

## Architecture

```text
React + TypeScript chat interface
                ↓
Express + TypeScript API
                ↓
AI tool selection → shared data services → deterministic calculations
                ↓
Evidence-checked answer → interface with sources and limitations
```

Data endpoints and AI tools use the same services, so calculations are not duplicated. Pure TypeScript modules handle growth, scoring and financial calculations independently of the model. Local snapshots and a small weather cache keep the architecture simple; no database is required.

- **Passenger data:** an explicit refresh command downloads official FAA annual PDFs, validates the selected rows, reconciles overlapping years and saves a snapshot with original-file checksums. Requests use that snapshot. A documented manual-extract fallback is labeled when downloaded files are absent.
- **Investment evidence:** selected facts from official airport documents are stored with source links, dates, project scope and document locations. These are curated records; investment PDFs are not downloaded at runtime.
- **Weather:** public NOAA APIs provide recent observations, with a fallback provider, caching and stale-data labels. Weather supplies operational context and is excluded from scoring.

## Scoring methodology

The only ranked KPI is **Demand Growth Score**, based on annual FAA passenger boardings:

```text
growthPercent = (currentYear − previousYear) / previousYear × 100
score = min(100, max(0, 5 × (growthPercent + 10)))
```

Thus, −10% growth scores 0, zero growth scores 50, and +10% growth scores 100. These fixed anchors are prototype assumptions, not FAA benchmarks. Scores are independent of the comparison group. Airports are sorted by unrounded score descending; alphabetical IATA code breaks ties. Missing growth is unranked, a zero baseline yields no percentage, and incompatible reporting periods are rejected.

Passenger growth is a demand signal, not proof of terminal constraints or profitability. The separate investment assessment reports evidence gaps and requires further due diligence rather than assigning an unsupported investment rank.

Financial scenarios calculate NPV, simple payback and break-even annual net cash flow using sourced total project costs where available. Annual net cash flows of 3%, 6% and 10% of cost, an 8% discount rate, 30 operating years and three construction years are explicitly **assumed**. All capital is paid at year zero. Partial budgets are excluded. These scenarios are estimates, not airport forecasts or observed returns.

## Where and how AI is used

Gemini is the default model; OpenAI and local Ollama are optional adapters. The model interprets questions, resolves conversational references and selects tools for passenger growth, demand rankings, weather or investment assessment.

Each turn retrieves tool evidence. The model then selects a structured answer type and relevant airport codes. A deterministic server renderer validates those references and writes the displayed figures and explanations from tool results. The model does not calculate scores or supply displayed numerical facts. API keys remain server-side; failures produce safe errors and sanitized diagnostic logs.

## Key tradeoffs

- **Depth over breadth:** three airports demonstrate the complete flow; coverage is not nationwide.
- **Traceability over unrestricted prose:** verified templates reduce fabricated claims but limit conversational flexibility.
- **Reproducibility over continuous ingestion:** snapshots and curated documents are practical within one day, but require refresh and review as sources change.
- **Explicit uncertainty over false precision:** comparable terminal utilization, congestion statistics and project-specific cash-flow forecasts remain unavailable. Gate counts, runway constraints and floor area are not interchangeable capacity measures.
- **Simple delivery over infrastructure:** React, Express and small modules are easy to run and explain. Automated tests mock external services; calculations, tool behavior, error handling and TypeScript/build checks are verified without paid API calls.
