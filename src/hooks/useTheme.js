import { useEffect, useState } from 'react';

const KEY = 'syncparty:theme';

function readInitial() {
  if (typeof window === 'undefined') return 'dark';
  const saved = localStorage.getItem(KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return 'dark';
}

function apply(theme) {
  const root = document.documentElement;
  if (theme === 'light') root.classList.add('light');
  else root.classList.remove('light');
}

// Initialise ASAP so first paint uses the correct theme.
if (typeof window !== 'undefined') apply(readInitial());

let listeners = new Set();
let current = readInitial();

function setGlobal(next) {
  current = next;
  localStorage.setItem(KEY, next);
  apply(next);
  listeners.forEach((fn) => fn(next));
}

export function useTheme() {
  const [theme, setLocal] = useState(current);
  useEffect(() => {
    const fn = (t) => setLocal(t);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);
  return {
    theme,
    toggle: () => setGlobal(theme === 'dark' ? 'light' : 'dark'),
    setTheme: setGlobal,
  };
}
