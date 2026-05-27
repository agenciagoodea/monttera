import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const originalFetch = window.fetch.bind(window);

function readCookie(name: string) {
  const encodedName = `${encodeURIComponent(name)}=`;
  const parts = document.cookie.split(';');
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith(encodedName)) {
      return decodeURIComponent(trimmed.slice(encodedName.length));
    }
  }
  return '';
}

window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const nextInit: RequestInit = { ...(init || {}) };
  const method = String(nextInit.method || 'GET').toUpperCase();
  const shouldAttachCsrf = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
  if (shouldAttachCsrf) {
    const csrfToken = readCookie('csrf_token');
    const headers = new Headers(nextInit.headers || {});
    if (csrfToken && !headers.has('x-csrf-token')) {
      headers.set('x-csrf-token', csrfToken);
    }
    nextInit.headers = headers;
    if (!nextInit.credentials) nextInit.credentials = 'include';
  }
  return originalFetch(input, nextInit);
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
