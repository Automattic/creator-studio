import React, { useEffect, useRef, useState } from 'react';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  tools: string[];
  streaming: boolean;
  errored?: boolean;
};

let counter = 0;
const nextId = (): string => `m${++counter}`;

export function App() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);

  // Ref so the event handler always has the id of the currently-streaming
  // assistant bubble without re-subscribing on every state update.
  const streamingIdRef = useRef<string | null>(null);

  useEffect(() => {
    const off = window.api.chat.onEvent((event) => {
      const id = streamingIdRef.current;
      if (!id) return;
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== id) return m;
          switch (event.kind) {
            case 'text-delta':
              return { ...m, text: m.text + event.text };
            case 'tool-use':
              return { ...m, tools: [...m.tools, event.toolName] };
            case 'error':
              return {
                ...m,
                text: m.text + (m.text ? '\n\n' : '') + `Error: ${event.message}`,
                errored: true,
              };
            case 'done':
              return { ...m, streaming: false };
            default:
              return m;
          }
        }),
      );
      if (event.kind === 'done' || event.kind === 'error') {
        streamingIdRef.current = null;
        if (event.kind === 'done') setBusy(false);
      }
    });
    return off;
  }, []);

  const onSend = async () => {
    const text = input.trim();
    if (!text || busy) return;
    const userMsg: Message = {
      id: nextId(),
      role: 'user',
      text,
      tools: [],
      streaming: false,
    };
    const assistantMsg: Message = {
      id: nextId(),
      role: 'assistant',
      text: '',
      tools: [],
      streaming: true,
    };
    streamingIdRef.current = assistantMsg.id;
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput('');
    setBusy(true);
    try {
      await window.api.chat.send(text);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const id = streamingIdRef.current;
      streamingIdRef.current = null;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id
            ? { ...m, text: `Error: ${message}`, streaming: false, errored: true }
            : m,
        ),
      );
      setBusy(false);
    }
  };

  return (
    <div className="app">
      <header className="titlebar" data-testid="titlebar" />

      <main className="transcript" data-testid="transcript">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`bubble bubble-${m.role}${m.errored ? ' bubble-error' : ''}`}
            data-testid={`bubble-${m.role}`}
            data-streaming={m.streaming ? 'true' : 'false'}
          >
            {m.tools.length > 0 && (
              <div className="bubble-tools" data-testid="tool-indicator">
                {m.tools.map((t, i) => (
                  <span key={i} className="bubble-tool">
                    🔧 {t}
                  </span>
                ))}
              </div>
            )}
            <div className="bubble-text">{m.text}</div>
          </div>
        ))}
      </main>

      <div className="composer" data-testid="composer">
        <textarea
          className="composer-input"
          data-testid="chat-input"
          placeholder="Message Creators Studio…"
          rows={3}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
        />
        <button
          type="button"
          className="composer-send"
          data-testid="send-button"
          onClick={onSend}
          disabled={busy || input.trim().length === 0}
        >
          {busy ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  );
}
