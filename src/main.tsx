import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import * as Sentry from '@sentry/react';
import App from './App.tsx';
import './index.css';

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const CHUNK_RELOAD_KEY = 'em-box.chunk-reload-attempted';

const isChunkLoadError = (value: unknown) => {
  const message = value instanceof Error ? value.message : String(value ?? '');
  return message.includes('Failed to fetch dynamically imported module')
    || message.includes('Importing a module script failed')
    || message.includes('Expected a JavaScript-or-Wasm module script');
};

window.addEventListener('error', (event) => {
  if (!isChunkLoadError(event.error ?? event.message)) return;
  if (sessionStorage.getItem(CHUNK_RELOAD_KEY)) return;
  sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
  window.location.reload();
});

window.addEventListener('unhandledrejection', (event) => {
  if (!isChunkLoadError(event.reason)) return;
  if (sessionStorage.getItem(CHUNK_RELOAD_KEY)) return;
  sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
  window.location.reload();
});

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    environment: import.meta.env.PROD ? 'production' : 'development',
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
