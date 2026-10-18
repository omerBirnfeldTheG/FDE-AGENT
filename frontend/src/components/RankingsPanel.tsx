import { useState } from 'react';
import type { AirportEvidence, Rankings } from '../api.ts';
import { useRankings, useInvestment } from '../hooks/useAirportData.ts';
import { airportNames, percent } from '../display.ts';
import { AirportFacts, InvestmentFacts, Limitations } from './Evidence.tsx';
type Props = { ask: (text: string) => Promise<void>; pending: boolean };
type TableProps = { data: Rankings; selected: string | null; select: (iata: string | null) => void };

function InvestmentPanel({ iata }: { iata: string }) {
  const state = useInvestment(iata);
  return <details><summary>Investment evidence and scenarios</summary>
    {state.error ? <p role="alert">{state.error}</p> : state.data ? <InvestmentFacts data={state.data} /> : <p>Loading evidence…</p>}
  </details>;
}

function AirportButton({ airport, selected, select }: { airport: AirportEvidence } & Omit<TableProps, 'data'>) {
  return <button className="airport-button" aria-expanded={selected === airport.iata} onClick={() => select(selected === airport.iata ? null : airport.iata)}>
    <span className="rank-number">{airport.rank}</span><span><strong>{airport.iata}</strong><small>{airportNames[airport.iata]}</small></span>
  </button>;
}

function ScoreCell({ airport }: { airport: AirportEvidence }) {
  return <td><b>{airport.score?.toFixed(2) ?? '—'}</b>
    <div className="score-track" aria-hidden="true"><span style={{ width: `${airport.score ?? 0}%` }} /></div></td>;
}

function AirportRow({ airport, selected, select }: { airport: AirportEvidence } & Omit<TableProps, 'data'>) {
  return <tr className={selected === airport.iata ? 'selected' : ''}>
    <td><AirportButton airport={airport} selected={selected} select={select} /></td>
    <td className={airport.yearOverYear.growthPercent! > 0 ? 'positive' : 'negative'}>{percent(airport.yearOverYear.growthPercent)}<small>{airport.yearOverYear.fromYear} → {airport.yearOverYear.toYear}</small></td>
    <ScoreCell airport={airport} /></tr>;
}

function RankingsTable(props: TableProps) {
  return <div className="table-scroll"><table>
    <caption className="sr-only">Demand Growth Score rankings based on reported passenger boardings</caption>
    <thead><tr><th scope="col">Airport</th><th scope="col">YoY growth</th><th scope="col">Score / 100</th></tr></thead>
    <tbody>{props.data.rankings.map(airport => <AirportRow key={airport.iata} airport={airport} selected={props.selected} select={props.select} />)}</tbody>
  </table></div>;
}

function Methodology({ data }: { data: Rankings }) {
  return <details className="methodology"><summary>How the score works</summary><p className="formula">score = clamp(5 × (growth% + 10), 0, 100)</p>
    <div className="scale-labels"><span>−10% → 0</span><span>0% → 50</span><span>+10% → 100</span></div>
    <p>Fixed heuristic anchors, not FAA benchmarks. Values beyond the anchors are clipped. Missing data is unranked.</p>
    <p>{data.methodology.rankingRule}</p><small>Methodology v{data.methodology.version} · Calculated KPI</small></details>;
}

function SelectedAirport({ airport, ask, pending }: { airport: AirportEvidence } & Props) {
  return <div className="selected-detail"><AirportFacts airport={airport} /><InvestmentPanel iata={airport.iata} />
    <button className="text-button" disabled={pending} onClick={() => void ask(`Explain passenger growth for ${airport.iata}.`)}>Ask about {airport.iata} ↗</button>
  </div>;
}

function RankingsData({ data, ask, pending }: { data: Rankings } & Props) {
  const [selected, select] = useState<string | null>(null);
  const airport = [...data.rankings, ...data.unranked].find(row => row.iata === selected);
  return <><RankingsTable data={data} selected={selected} select={select} />
    {data.unranked.map(row => <p key={row.iata}>{row.iata}: unranked — {row.yearOverYear.unavailableReason}</p>)}
    <p className="table-hint">Select an airport to inspect counts and FAA sources.</p>
    {airport && <SelectedAirport airport={airport} ask={ask} pending={pending} />}<Methodology data={data} /></>;
}

function DataNotes({ data }: { data: Rankings | null }) {
  return <section className="panel provenance-panel"><p className="eyebrow">DATA NOTES</p><h2>Know what’s available.</h2>
    <p>FAA calendar-year enplanements measure boardings, not total passengers or unique travelers. Coverage is LAX, SFO and BOS.</p>
    <p>{data?.dataSnapshot.mode === 'official-pdf-download' ? 'Counts come from downloaded FAA PDFs.' : 'Counts come from documented local PDF extracts.'} Annual data is a snapshot, not a live feed.</p>
    <p>Investment records are dated document extracts. Financial scenarios are assumptions. Comparable terminal utilization and verified project returns remain unavailable.</p>
    {data && <details><summary>Snapshot provenance</summary><small>Captured {data.dataSnapshot.capturedOn}</small><Limitations lines={data.coverage.limitations} /></details>}</section>;
}

function RankingsHeading() {
  return <><div className="panel-heading"><div><p className="eyebrow">01 / COMPARE</p><h2 id="rankings-heading">Demand growth rankings</h2></div><span className="tag">DETERMINISTIC</span></div>
    <p className="panel-description">Ranked within the currently validated dataset.</p></>;
}

export function RankingsPanel(props: Props) {
  const state = useRankings();
  return <aside className="data-column"><section className="panel rankings-panel" aria-labelledby="rankings-heading"><RankingsHeading />
    {state.loading && <p role="status">Loading verified airport data…</p>}
    {state.error && <div className="error-box" role="alert"><p>{state.error}</p><button onClick={() => void state.reload()}>Reload data</button></div>}
    {state.data && <RankingsData data={state.data} {...props} />}</section><DataNotes data={state.data} /></aside>;
}
