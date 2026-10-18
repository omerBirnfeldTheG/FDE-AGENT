# How to explain this project

## The story in one minute

“This assistant helps an analyst investigate airport terminal investment opportunities. It compares verified passenger growth, shows infrastructure and project evidence, and illustrates how financial assumptions affect returns. It shows sources and missing information rather than promising profitability. The AI chooses the relevant tools; ordinary TypeScript calculates the numbers.”

## What happens when someone asks a question?

1. The React screen sends the question and recent conversation to Express at `/api/chat`.
2. The server checks the input and asks the configured model which tool to use.
3. The tool calls the same service used by our ordinary data endpoints. It retrieves evidence or runs a calculation.
4. The server sends the tool result back to the model. The model chooses a response type and airport codes.
5. A server template checks the evidence and writes the actual figures and explanation. The model does not supply the displayed numbers.
6. The screen shows the answer and expandable supporting evidence.

Follow-ups include the previous successful exchanges, but each new answer retrieves tool evidence again. Failed requests are shown as errors and excluded from conversation history.

## Where does the data come from?

| Source | When it is retrieved | What is stored |
|---|---|---|
| FAA annual passenger PDFs | Explicit `npm run refresh:data` command | Archived PDFs and a parsed snapshot; restart the backend afterward |
| Official airport investment documents | Manually researched before adding a record | Facts, dates, scope and links in `investment-evidence.ts`; original PDFs are not archived |
| NOAA public weather APIs | When weather is requested, with caching | Temporary observations in server memory |

The included documented passenger snapshot allows a fresh checkout to work before downloading FAA files. Its fallback status is disclosed. Coverage is LAX, SFO and BOS only.

## How are the methods explained?

**Passenger growth:** subtract last year's boardings from this year's, divide by last year's, and multiply by 100. A missing value or zero baseline cannot produce a percentage.

**Demand Growth Score:** −10% growth maps to 0, zero growth maps to 50, and +10% maps to 100. Values beyond those anchors stop at 0 or 100. These anchors are prototype assumptions. Sort scores from highest to lowest; alphabetic airport code breaks a tie. It measures growth, not profitability.

**Investment assessment:** show the demand signal, source-backed project facts, and evidence gaps. We do not have comparable terminal utilization and project cash-flow forecasts, so the result is “due diligence required,” with low confidence. Floor area and gates are not annual passenger capacity. Runway delays do not automatically justify a terminal expansion.

**Financial scenarios:** use a reported total project cost where available and assume annual incremental net cash flow equal to 3%, 6%, or 10% of that cost. These are illustrative cases, not forecasts. Assume 8% discount rate, 30 operating years, and three construction years. All capital is paid immediately.

- NPV subtracts the initial cost from the present value of future cash flows. Positive means that the scenario exceeds the assumed required return.
- Simple payback is how long it takes assumed income to recover the cost, without discounting. It is unavailable if recovery exceeds the modeled operating horizon.
- Break-even cash flow is the constant annual income needed to make NPV zero.

BOS's historical partial budget cannot support a full-project scenario. The project reports no observed NPV, IRR, or payback for any airport.

## Where should I look in the code?

| Folder/file | Responsibility |
|---|---|
| `backend/server.ts` | Starts the server |
| `backend/app.ts` | Routes requests and handles errors |
| `backend/data/` | Retrieves or stores source data and provenance |
| `backend/domain/` | Pure growth, score and financial calculations |
| `backend/services/` | Combines source data and calculations |
| `backend/agent/tools.ts` | Lists the functions the model may call |
| `backend/agent/chat.ts` | Validates conversation, runs the tool loop, renders verified answers |
| `backend/agent/*-client.ts` | Adapts Gemini, OpenAI or local Ollama |
| `frontend/src/api.ts` | Sends browser requests |
| `frontend/src/App.tsx` | Arranges the page; delegates to small components |
| `backend/tests/`, `frontend/tests/` | Repeatable checks with mocked model/network responses |
| `validation/` | Passenger import and original validation evidence |

## What is intentionally retained?

The three model adapters support configured provider choices. Validation scripts document/reproduce passenger acquisition. Example JSON files illustrate earlier responses; they are not loaded by the application. `http-smoke.ts` is a manual check for a running local server. Test helpers support route tests without opening a socket. These files are not unused application code.

Local editor settings, dependencies, secrets and generated build/data downloads are excluded from Git. An empty investment directory was removed.

## What should I say about limitations?

“This is a one-day prototype for screening and investigation. Public weather APIs demonstrate live aviation retrieval; FAA reports provide annual demand; public airport documents provide dated investment context. Comparable terminal utilization, delay statistics and verified incremental financial benefits are missing. I make those gaps explicit instead of creating a misleading profitability ranking.”

Before presenting, run `npm test`, `npm run typecheck`, and `npm run build:frontend`. Start the backend and frontend, then demonstrate a ranking, a comparison follow-up, a sourced investment scenario, and an unsupported airport question.


## Reading the reorganized code

Start at `backend/app.ts`: its only job is arranging routes. `backend/http/` handles provider setup, chat requests and HTTP errors. `backend/agent/chat.ts` reads as a sequence of named steps: request a model decision, check the response, execute the selected tools, and finish an evidenced answer. `backend/agent/answers/` contains the separate explanation templates and response selection rules.

On the frontend, `App.tsx` arranges the screen. `components/ChatPanel.tsx`, `RankingsPanel.tsx`, and `Evidence.tsx` handle their own parts of the display. `hooks/useChat.ts` handles conversation state; `hooks/useAirportData.ts` loads data. `display.ts` shares source validation and number formatting.

Application and validation function bodies are limited to six physical lines, checked with `npm run check:readability`. Longer operations are expressed by named helper functions rather than squeezed onto one line. Tests intentionally retain complete arrange/act/assert scenarios so a failure can be understood in one place; the length check excludes test files. Shared helpers remove repeated airport-code validation, tool-argument parsing, weather transport, unit conversion, financial assumptions and source-link validation.
