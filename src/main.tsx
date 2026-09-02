import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './design-system/tokens.css';
import './design-system/ui-foundation.css';
import './design-system/shell.css';
import './design-system/showcase.css';
import './design-system/contract.css';
import './design-system/apple.css';
import './design-system/landing.css';
import { App } from './app/App.tsx';
import { AppStateProvider } from './app/AppState.tsx';
import { AuthBoundary } from './cherry/auth/auth-boundary.tsx';

// PWA: register the service worker for the static shell only. Workspace data
// lives in IndexedDB and is never cached by the worker.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Offline shell unavailable; the app still works online.
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthBoundary>
        <AppStateProvider>
          <App />
        </AppStateProvider>
      </AuthBoundary>
    </BrowserRouter>
  </StrictMode>,
);
