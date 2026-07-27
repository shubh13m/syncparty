import { useEffect, useRef, useState } from 'react';

function timeAgo(ts) {
  if (!ts) return '';
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 5) return 'now';
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h`;
}

export function ChatPanel({ messages, uid, onSend }) {
  const [text, setText] = useState('');
  const scrollRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const submit = (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText('');
  };

  return (
    <div className="flex flex-col h-[60vh]">
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-2 pr-1 mb-2">
        {messages.length === 0 && (
          <div className="text-xs text-brand-muted text-center pt-8">Say hi 👋</div>
        )}
        {messages.map((m) => {
          const mine = m.senderUid === uid;
          return (
            <div key={m.key} className={`text-sm ${mine ? 'text-right' : ''}`}>
              <div className="text-[10px] text-brand-muted mb-0.5">
                <span style={{ color: m.senderColor || '#888' }}>{m.senderName || 'anon'}</span>
                <span className="ml-1">{timeAgo(m.ts)}</span>
              </div>
              <div
                className={`inline-block px-2.5 py-1.5 rounded-xl max-w-[90%] break-words text-left ${mine ? 'bg-brand-accent2/25' : 'bg-brand-hover'}`}
              >
                {m.text}
              </div>
            </div>
          );
        })}
      </div>
      <form onSubmit={submit} className="flex gap-1.5 flex-shrink-0">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          placeholder="Message…"
          className="flex-1 bg-brand-bg border border-brand-border focus:border-brand-text outline-none rounded-lg px-2.5 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="px-3 py-1.5 rounded-lg bg-brand-accent text-brand-accent-fg hover:opacity-90 disabled:opacity-40 text-sm"
        >
          Send
        </button>
      </form>
    </div>
  );
}
