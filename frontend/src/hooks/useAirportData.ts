import { useEffect, useState } from 'react';
import type { InvestmentAssessment, Rankings } from '../api.ts';
import { getRankings } from '../api.ts';
import { errorMessage } from '../display.ts';
type State<T> = { data: T | null; error: string; loading: boolean };

async function loadRankings(update: React.Dispatch<React.SetStateAction<State<Rankings>>>) {
  update(state => ({ ...state, error: '', loading: true }));
  try { update({ data: await getRankings(), error: '', loading: false }); }
  catch (error) { update(state => ({ ...state, error: errorMessage(error), loading: false })); }
}

export function useRankings() {
  const [state, update] = useState<State<Rankings>>({ data: null, error: '', loading: true });
  useEffect(() => { void loadRankings(update); }, []);
  return { ...state, reload: () => loadRankings(update) };
}

async function fetchInvestment(iata: string, signal: AbortSignal): Promise<InvestmentAssessment> {
  const response = await fetch(`/api/airports/${iata}/investment-assessment`, { signal });
  if (!response.ok) throw new Error('Investment evidence could not be loaded.');
  return response.json();
}

async function loadInvestment(iata: string, signal: AbortSignal, update: React.Dispatch<React.SetStateAction<State<InvestmentAssessment>>>) {
  try { const data = await fetchInvestment(iata, signal); if (!signal.aborted) update({ data, error: '', loading: false }); }
  catch (error) { if (!signal.aborted) update({ data: null, error: errorMessage(error), loading: false }); }
}

function startInvestmentLoad(iata: string, update: React.Dispatch<React.SetStateAction<State<InvestmentAssessment>>>) {
  const controller = new AbortController();
  update({ data: null, error: '', loading: true });
  void loadInvestment(iata, controller.signal, update);
  return () => controller.abort();
}

export function useInvestment(iata: string) {
  const [state, update] = useState<State<InvestmentAssessment>>({ data: null, error: '', loading: true });
  useEffect(() => startInvestmentLoad(iata, update), [iata]);
  return state;
}
