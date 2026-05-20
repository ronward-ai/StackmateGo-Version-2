import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { auth } from "./lib/firebase";

// Delete stale Firestore IndexedDB databases left over from before the app
// switched to memoryLocalCache. They serve no purpose now and consume the
// browser's origin storage quota, which causes Firebase Auth's own IndexedDB
// writes to fail with QuotaExceededError on storage-constrained devices
// (iOS Safari, Chrome on iPad/Android with limited free space).
if ('indexedDB' in window) {
  const tryDelete = (name: string) => {
    try { indexedDB.deleteDatabase(name); } catch { /* ignore */ }
  };
  // Enumerate all databases and drop any Firestore ones (Safari 14.5+ / Chrome 72+)
  if (typeof (indexedDB as any).databases === 'function') {
    (indexedDB as any).databases().then((dbs: { name?: string }[]) => {
      dbs.forEach(db => {
        if (db.name && /firestore/i.test(db.name)) tryDelete(db.name);
      });
    }).catch(() => {});
  } else {
    // Fallback: blindly attempt known Firestore database name patterns
    ['firestore/[DEFAULT]/main', 'firestore/[DEFAULT]/documents'].forEach(tryDelete);
  }
}

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
