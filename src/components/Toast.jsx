import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const ToastCtx = createContext(null);

let idCounter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((cur) => cur.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((msg, opts = {}) => {
    const id = ++idCounter;
    const t = {
      id,
      msg: String(msg),
      kind: opts.kind || 'info', // info | success | warn | error
      duration: opts.duration ?? 3500,
    };
    setToasts((cur) => [...cur, t]);
    if (t.duration > 0) {
      setTimeout(() => dismiss(id), t.duration);
    }
    return id;
  }, [dismiss]);

  const api = {
    info: (m, o) => push(m, { ...o, kind: 'info' }),
    success: (m, o) => push(m, { ...o, kind: 'success' }),
    warn: (m, o) => push(m, { ...o, kind: 'warn' }),
    error: (m, o) => push(m, { ...o, kind: 'error' }),
    dismiss,
  };

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-[90vw] pointer-events-none">
        {toasts.map((t) => (
          <ToastItem key={t.id} t={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

function ToastItem({ t, onDismiss }) {
  const [enter, setEnter] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setEnter(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const kindClass = {
    info: 'bg-slate-800 border-slate-600',
    success: 'bg-emerald-900/90 border-emerald-600',
    warn: 'bg-amber-900/90 border-amber-600',
    error: 'bg-red-900/90 border-red-600',
  }[t.kind] || 'bg-slate-800 border-slate-600';
  return (
    <div
      className={`pointer-events-auto border ${kindClass} text-slate-100 text-sm rounded-lg px-3 py-2 shadow-lg transition-all duration-200 ${enter ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'}`}
      onClick={onDismiss}
      role="alert"
    >
      {t.msg}
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) {
    // Safe fallback so components don't crash if provider is missing.
    return { info: () => {}, success: () => {}, warn: () => {}, error: () => {}, dismiss: () => {} };
  }
  return ctx;
}
