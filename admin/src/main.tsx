import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initSentry } from './lib/sentry'
import './index.css'
import App from './App.tsx'

initSentry();

// New deploy → old hashed chunks vanish from Vercel. When a lazy-loaded chunk
// fails to preload, Vite fires this event. Reload once to fetch the new version.
// The sessionStorage guard prevents an infinite reload loop if a deploy is truly broken.
window.addEventListener('vite:preloadError', () => {
  const KEY = 'aa-preload-reloaded';
  if (sessionStorage.getItem(KEY)) return;
  sessionStorage.setItem(KEY, '1');
  window.location.reload();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
