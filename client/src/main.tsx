import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { auth } from "./lib/firebase";

// Suppress ResizeObserver loop errors which are benign
const originalError = console.error;
console.error = (...args) => {
  if (args[0] && typeof args[0] === 'string' && args[0].includes('ResizeObserver loop')) {
    return;
  }
  originalError.call(console, ...args);
};

window.addEventListener('error', (e) => {
  if (e.message === 'ResizeObserver loop limit exceeded' || e.message === 'ResizeObserver loop completed with undelivered notifications.') {
    e.stopImmediatePropagation();
    e.preventDefault();
  }
});

createRoot(document.getElementById("root")!).render(<App />);
