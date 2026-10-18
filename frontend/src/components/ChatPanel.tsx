import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { useChat, Turn } from '../hooks/useChat.ts';
import { Evidence } from './Evidence.tsx';
type Chat = ReturnType<typeof useChat>;
const prompts = ['Why is SFO ranked first?', 'How does SFO compare to LAX?', 'What is the current aviation weather at SFO?', 'Assess SFO terminal investment costs and financial scenarios.'];

function ReplyText({ text }: { text: string }) {
  const paragraphs = text.split(/\n\s*\n/).filter(paragraph => !paragraph.startsWith('FAA source,'));
  return <div className="reply-text">{paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>;
}

function Message({ turn }: { turn: Turn }) {
  return <article className={`message ${turn.role}`}>
    <div className="message-label">{turn.role === 'user' ? 'YOU' : 'AIRPORT INTELLIGENCE'}{turn.result && <span>VERIFIED DATA · {turn.result.provider}</span>}</div>
    {turn.role === 'assistant' ? <ReplyText text={turn.content} /> : <p>{turn.content}</p>}
    {turn.failed && <small className="error-note">Request failed · not added to conversation context</small>}
    {turn.result && <Evidence result={turn.result} />}</article>;
}

function Welcome({ chat }: { chat: Chat }) {
  return <div className="welcome"><div className="compass" aria-hidden="true">↗</div><h3>What would you like to explore?</h3>
    <p>Compare demand, inspect investment evidence, and explore explicitly assumed financial scenarios.</p>
    <div className="prompt-grid">{prompts.map(prompt => <button key={prompt} disabled={chat.pending} onClick={() => void chat.ask(prompt)}>{prompt}<span aria-hidden="true">↗</span></button>)}</div>
    <p className="welcome-footnote">Answers stay grounded in backend evidence.</p></div>;
}

function Conversation({ chat }: { chat: Chat }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [chat.turns, chat.pending, chat.error]);
  return <div className="chat-scroll" role="log" aria-label="Conversation" aria-live="polite" aria-relevant="additions">
    {!chat.turns.length && <Welcome chat={chat} />}{chat.turns.map(turn => <Message key={turn.id} turn={turn} />)}
    {chat.pending && <p className="thinking" role="status">Checking tools and verified data… Local models may take a few minutes.</p>}<div ref={end} /></div>;
}

function submitOnEnter(event: KeyboardEvent<HTMLTextAreaElement>, send: () => void) {
  if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
  event.preventDefault();
  send();
}

function Composer({ chat }: { chat: Chat }) {
  const { message, setMessage, textarea } = useComposerState(chat.pending);
  const send = () => { if (!chat.pending && message.trim()) { void chat.ask(message); setMessage(''); } };
  return <form className="composer" onSubmit={event => { event.preventDefault(); send(); }}>
    <label className="sr-only" htmlFor="question">Ask a question about airport demand</label><textarea id="question" ref={textarea} value={message} maxLength={4000} rows={2} disabled={chat.pending} placeholder="Ask about demand, investment evidence or financial scenarios…" onChange={event => setMessage(event.target.value)} onKeyDown={event => submitOnEnter(event, send)} />
    <div className="composer-bottom"><small>Enter to send · Shift + Enter for a new line</small><button className="send-button" disabled={chat.pending || !message.trim()}>{chat.pending ? 'Working…' : 'Send question'} ↗</button></div></form>;
}

function ChatError({ chat }: { chat: Chat }) {
  if (!chat.error) return null;
  return <div className="error-box chat-error" role="alert"><p>{chat.error}</p>
    <button className="text-button" disabled={chat.pending} onClick={() => void chat.ask(chat.lastAttempt)}>Retry this question</button></div>;
}

export function ChatPanel({ chat }: { chat: Chat }) {
  return <section className="panel chat-panel" aria-labelledby="chat-heading">
    <div className="chat-heading"><div><p className="eyebrow">02 / INVESTIGATE</p><h2 id="chat-heading">Ask the analyst assistant</h2></div><button className="text-button" disabled={chat.pending || !chat.turns.length} onClick={chat.reset}>New conversation</button></div>
    <Conversation chat={chat} /><ChatError chat={chat} /><Composer key={chat.turns.length === 0 ? 'empty' : 'active'} chat={chat} />
    <p className="chat-disclosure">Recent context stays in memory. No chat is saved after refresh. AI provider quotas may apply.</p>
  </section>;
}

function useComposerState(pending: boolean) {
  const [message, setMessage] = useState('');
  const textarea = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (pending) setMessage(''); else textarea.current?.focus(); }, [pending]);
  return { message, setMessage, textarea };
}
