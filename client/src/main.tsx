// MUST stay the first import. This module installs its global error and
// unhandledrejection handlers as a side effect of being evaluated, and module
// evaluation follows import order, so nothing here can throw before they are
// armed. No-op unless the URL carries ?debug=1.
import "./lib/debugOverlay";

import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// ./lib/firebase is deliberately NOT imported here. It used to be, for `auth`,
// which was never actually referenced — so Rollup tree-shook it anyway once the
// routes were split. Firebase now initialises with whichever route chunk first
// needs it, keeping its 146 kB (gzipped) out of the initial load. The debug
// handlers above are installed in the entry chunk, so they are still armed
// before that happens.

// Suppress ResizeObserver loop errors which are benign
const originalError = console.error;
console.error = (...args) => {
  if (args[0] && typeof args[0] === 'string' && args[0].includes('ResizeObserver loop')) {
    return;
  }
  originalError.call(console, ...args);
};

window.addEventListener('error', (e) => {
  if (e.message && typeof e.message === 'string' && e.message.includes('ResizeObserver')) {
    e.stopImmediatePropagation();
    e.preventDefault();
  }
});

// Patch ResizeObserver to prevent "ResizeObserver loop limit exceeded" and "ResizeObserver loop completed with undelivered notifications."
if (typeof window !== 'undefined' && window.ResizeObserver) {
  const OriginalResizeObserver = window.ResizeObserver;
  window.ResizeObserver = class ResizeObserver extends OriginalResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      super((entries, observer) => {
        window.requestAnimationFrame(() => {
          callback(entries, observer);
        });
      });
    }
  };
}

createRoot(document.getElementById("root")!).render(<App />);
