import { useChat } from './hooks/useChat.ts';
import { ChatPanel } from './components/ChatPanel.tsx';
import { RankingsPanel } from './components/RankingsPanel.tsx';

function Header() {
  return <header className="topbar"><a className="brand" href="/" aria-label="Airport Intelligence home">
    <span className="brand-mark" aria-hidden="true">↗</span><span>AIRPORT<span className="brand-light"> INTELLIGENCE</span></span></a>
    <span className="workspace-label">ANALYST WORKSPACE <span className="version">MVP 01</span></span></header>;
}

function Introduction() {
  return <><section className="page-heading"><div><p className="eyebrow">AVIATION DATA · DEMAND SCREENING</p><h1>Start with the evidence.</h1>
    <p className="intro">Compare demand. Inspect investment evidence. Explore financial assumptions.</p></div>
    <div className="coverage-chip"><span className="status-dot" />Validated coverage<strong>LAX · SFO · BOS</strong></div></section>
    <div className="scope-note"><span aria-hidden="true">ⓘ</span><p><strong>A screening signal, not an investment recommendation.</strong> Passenger growth alone does not establish terminal expansion need or profitability.</p></div></>;
}

function Footer() {
  return <footer>PUBLIC AVIATION DATA. EXPLAINABLE CALCULATIONS.
    <span>Airport Investment Intelligence Agent · Take-home prototype</span></footer>;
}

export function App() {
  const chat = useChat();
  return <div className="app-shell"><Header /><main><Introduction />
    <div className="workspace-grid"><RankingsPanel ask={chat.ask} pending={chat.pending} /><ChatPanel chat={chat} /></div>
    <Footer /></main></div>;
}
