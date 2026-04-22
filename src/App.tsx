import React from 'react';

export function App() {
  return (
    <div className="app">
      <header className="titlebar" data-testid="titlebar" />

      <main className="transcript" data-testid="transcript" />

      <form
        className="composer"
        data-testid="composer"
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        <textarea
          className="composer-input"
          data-testid="chat-input"
          placeholder="Message Creators Studio…"
          rows={3}
        />
        <button type="submit" className="composer-send" data-testid="send-button">
          Send
        </button>
      </form>
    </div>
  );
}
