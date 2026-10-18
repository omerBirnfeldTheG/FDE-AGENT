import { useRef, useState } from 'react';
import { sendMessage } from '../api.ts';
import type { ChatResponse, HistoryMessage } from '../api.ts';
import { errorMessage } from '../display.ts';
export type Turn = { id: number; role: 'user' | 'assistant'; content: string; result?: ChatResponse; failed?: boolean };
type ChatState = { turns: Turn[]; history: HistoryMessage[]; pending: boolean; error: string; lastAttempt: string };
const emptyChat: ChatState = { turns: [], history: [], pending: false, error: '', lastAttempt: '' };
type Update = React.Dispatch<React.SetStateAction<ChatState>>;

function startQuestion(update: Update, query: string, id: number) {
  update(state => ({ ...state, pending: true, error: '', lastAttempt: query,
    turns: [...state.turns, { id, role: 'user', content: query }] }));
}

function saveAnswer(update: Update, query: string, result: ChatResponse, id: number) {
  update(state => ({ ...state,
    turns: [...state.turns, { id, role: 'assistant', content: result.reply, result }],
    history: [...state.history, { role: 'user', content: query }, { role: 'assistant', content: result.reply }] }));
}

function saveFailure(update: Update, error: unknown, id: number) {
  update(state => ({ ...state, error: errorMessage(error),
    turns: state.turns.map(turn => turn.id === id ? { ...turn, failed: true } : turn) }));
}

async function requestAnswer(update: Update, query: string, history: HistoryMessage[], id: number, nextId: () => number) {
  try { saveAnswer(update, query, await sendMessage(query, history), nextId()); }
  catch (error) { saveFailure(update, error, id); }
}

function useChatState() {
  const [state, update] = useState(emptyChat);
  const inFlight = useRef(false), sequence = useRef(0);
  return { state, update, inFlight, nextId: () => ++sequence.current };
}

async function askQuestion(chat: ReturnType<typeof useChatState>, text: string) {
  const query = text.trim();
  if (!query || query.length > 4000 || chat.inFlight.current) return;
  chat.inFlight.current = true;
  const id = chat.nextId(); startQuestion(chat.update, query, id);
  try { await requestAnswer(chat.update, query, chat.state.history, id, chat.nextId); }
  finally { chat.inFlight.current = false; chat.update(state => ({ ...state, pending: false })); }
}

export function useChat() {
  const chat = useChatState();
  return { ...chat.state, ask: (text: string) => askQuestion(chat, text),
    reset: () => { if (!chat.inFlight.current) chat.update(emptyChat); } };
}
