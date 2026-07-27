import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Dismiss splash after app mounts. Minimum ~900ms so the animation is seen; then fade + remove.
(function dismissSplash() {
  const el = document.getElementById('splash');
  if (!el) return;
  const start = performance.now();
  const MIN_MS = 900;
  requestAnimationFrame(() => {
    const wait = Math.max(0, MIN_MS - (performance.now() - start));
    setTimeout(() => {
      el.classList.add('hide');
      setTimeout(() => el.remove(), 400);
    }, wait);
  });
})();
