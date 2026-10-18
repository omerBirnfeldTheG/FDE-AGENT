import type { AirportEvidence, ChatResponse, Source, WeatherEvidence, InvestmentAssessment } from '../api.ts';
import { airportNames, count, percent, officialSource } from '../display.ts';
type Fact = InvestmentAssessment['facts'][number];
type Scenario = InvestmentAssessment['financialScenarios'][number];

export function Limitations({ lines }: { lines: string[] }) {
  return <ul className="limitations">{lines.map(line => <li key={line}>{line}</li>)}</ul>;
}

function SourceLink({ source }: { source: Source }) {
  return <li>
    <SourceTitle source={source} /><small>{source.title} · Published {source.publicationDate}</small>
    {source.downloadedAt && <small>Downloaded {source.downloadedAt}</small>}
    {source.sha256 && <small>SHA-256: <code>{source.sha256}</code></small>}
  </li>;
}

function SourceTitle({ source }: { source: Source }) {
  if (!officialSource(source.url, ['www.faa.gov'])) return <span>Source unavailable</span>;
  return <a href={source.url} target="_blank" rel="noreferrer">FAA · CY{source.reportingYear} ↗</a>;
}

function PassengerCounts({ airport }: { airport: AirportEvidence }) {
  return <div className="fact-grid">{airport.observations.map(row => <div key={row.year}>
    <small>CY{row.year} · Reported</small><b>{count(row.enplanements)}</b><span>passenger boardings</span>
  </div>)}</div>;
}

function GrowthSummary({ airport }: { airport: AirportEvidence }) {
  return <p className="calculated">
    Calculated growth: <b>{percent(airport.yearOverYear.growthPercent)}</b>
    {airport.score != null && <> · Demand Growth Score: <b>{airport.score.toFixed(2)}</b></>}
  </p>;
}

export function AirportFacts({ airport }: { airport: AirportEvidence }) {
  return <div className="airport-facts">
    <strong>{airport.iata} <span>{airportNames[airport.iata]}</span></strong><PassengerCounts airport={airport} />
    <GrowthSummary airport={airport} />{airport.yearOverYear.unavailableReason && <p>{airport.yearOverYear.unavailableReason}</p>}
    <ul className="source-list">{airport.sources.map(source => <SourceLink key={source.url} source={source} />)}</ul>
  </div>;
}

function WeatherMeasurements({ data }: { data: WeatherEvidence }) {
  const row = data.observation!;
  return <p>Visibility: {row.visibilityStatuteMiles ?? 'unavailable'} statute miles<br />
    Wind: {row.windSpeedKnots ?? 'unavailable'} knots<br />Gusts: {row.windGustKnots ?? 'unavailable'} knots<br />
    NOAA-derived flight category: {row.flightCategory ?? 'unavailable'}</p>;
}

function WeatherObservation({ data }: { data: WeatherEvidence }) {
  if (!data.observation) return <p>No observation available.</p>;
  return <><p>Observed {data.observation.observedAt}<br />
    {data.freshness}{data.observationStale ? ' · STALE: not current conditions' : ''}</p>
    <WeatherMeasurements data={data} /><p>{data.observation.rawMetar}</p></>;
}

function WeatherFacts({ data }: { data: WeatherEvidence }) {
  return <div className="airport-facts"><strong>{data.iata} · Aviation weather</strong>
    <p>Operational context only · excluded from the growth score.</p><WeatherObservation data={data} />
    {data.unavailableReason && <p>{data.unavailableReason}</p>}
    {officialSource(data.source.url, ['aviationweather.gov', 'api.weather.gov']) && <a href={data.source.url} target="_blank" rel="noreferrer">NOAA weather observation API ↗</a>}
    <Limitations lines={data.limitations} /></div>;
}

function InvestmentRecord({ fact }: { fact: Fact }) {
  return <div><p><b>{fact.metric.replaceAll('_', ' ')}:</b> {typeof fact.value === 'number' ? count(fact.value) : fact.value} {fact.unit}<br />{fact.scope} · {fact.temporalBasis}</p>
    {officialSource(fact.source.url, ['www.lawa.org', 'www.flysfo.com', 'www.massport.com']) && <a href={fact.source.url} target="_blank" rel="noreferrer">{fact.source.title} ↗</a>}
    <small>{fact.source.reportingPeriod} · {fact.source.locator}</small><p>{fact.limitations.join(' ')}</p>
  </div>;
}

function ScenarioRow({ row }: { row: Scenario }) {
  return <tr><td>{row.name}</td><td>${count(Math.round(row.npv))}</td>
    <td>{row.simplePaybackYearsFromInvestment?.toFixed(1) ?? 'Not reached'} years</td></tr>;
}

function ScenarioTable({ rows }: { rows: Scenario[] }) {
  if (!rows.length) return <p>No comparable total project cost available; no scenario generated.</p>;
  return <div className="table-scroll"><table><thead><tr><th>Assumed cash yield</th><th>NPV</th><th>Payback</th></tr></thead>
    <tbody>{rows.map(row => <ScenarioRow key={row.name} row={row} />)}</tbody></table></div>;
}

function FinancialScenarios({ data }: { data: InvestmentAssessment }) {
  return <><h3>Illustrative financial scenarios — estimates</h3>
    <ScenarioAssumptions rows={data.financialScenarios} />
    <ScenarioTable rows={data.financialScenarios} />
    <p>Missing inputs: {data.assessment.readiness.missingInputs.join('; ')}.</p></>;
}

export function InvestmentFacts({ data }: { data: InvestmentAssessment }) {
  return <div className="airport-facts"><strong>{data.iata} · Investment due diligence</strong>
    <p>Confidence: {data.assessment.confidence}. No verified profitability ranking.</p>
    {data.facts.map((fact, index) => <InvestmentRecord key={index} fact={fact} />)}
    <FinancialScenarios data={data} /><Limitations lines={data.limitations} /></div>;
}

function ToolEvidence({ item }: { item: ChatResponse['evidence'][number] }) {
  if (item.kind === 'error') return <p className="error-note">{item.error.message}</p>;
  if (item.kind === 'investment') return <InvestmentFacts data={item.data} />;
  if (item.kind === 'weather') return <WeatherFacts data={item.data} />;
  if (item.kind === 'growth') return <AirportFacts airport={item.data} />;
  return <>{[...item.data.rankings, ...item.data.unranked].map(airport => <AirportFacts key={airport.iata} airport={airport} />)}</>;
}

export function Evidence({ result }: { result: ChatResponse }) {
  return <details className="evidence">
    <summary>Inspect supporting data <span>{result.evidence.length} tool results</span></summary>
    {result.evidence.map((item, index) => <ToolEvidence key={index} item={item} />)}
    <p className="eyebrow">Coverage & limitations</p><Limitations lines={result.coverage.limitations} />
  </details>;
}

function ScenarioAssumptions({ rows }: { rows: Scenario[] }) {
  const input = rows[0]?.assumptions;
  if (!input) return <p>Financial assumptions are unavailable without a total project cost.</p>;
  return <p>Assumed {input.discountRate * 100}% discount rate, {input.operatingYears} operating years, {input.constructionYears} construction years; all capital paid at year zero. Cash flows are assumed, not airport forecasts.</p>;
}
