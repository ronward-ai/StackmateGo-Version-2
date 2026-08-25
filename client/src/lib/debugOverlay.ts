/**
 * Opt-in diagnostic overlay for reproducing errors on devices without DevTools.
 *
 * Enable by appending ?debug=1 to any URL, e.g.
 *   https://<host>/tournament/<id>/join?debug=1
 *
 * Off by default, so ordinary users never see it. Catches errors that React's
 * ErrorBoundary cannot: module-load failures, unhandled promise rejections
 * (the usual shape of a Firebase SDK failure), and anything thrown outside the
 * component tree. Deliberately dependency-free and DOM-only so it still works
 * when React itself has failed to mount.
 */

const DEBUG_PARAM = 'debug';

export function isDebugEnabled(): boolean {
  try {
    return new URLSearchParams(window.location.search).get(DEBUG_PARAM) === '1';
  } catch {
    return false;
  }
}

/** Build a readable report. `error.name` is kept separate — it carries the
 *  precise DOMException type (e.g. QuotaExceededError) that `message` often omits. */
export function formatErrorReport(
  label: string,
  error: unknown,
  componentStack?: string,
): string {
  const lines: string[] = [];
  lines.push(`--- ${label} ---`);
  lines.push(`when:  ${new Date().toISOString()}`);
  lines.push(`url:   ${window.location.href}`);
  lines.push(`ua:    ${navigator.userAgent}`);

  if (error instanceof Error) {
    lines.push(`name:  ${error.name}`);
    lines.push(`msg:   ${error.message}`);
    if ((error as any).code) lines.push(`code:  ${(error as any).code}`);
    lines.push('');
    lines.push(error.stack || '(no stack)');
  } else {
    lines.push(`value: ${String(error)}`);
    try {
      lines.push(`json:  ${JSON.stringify(error)}`);
    } catch {
      /* non-serialisable */
    }
  }

  if (componentStack) {
    lines.push('');
    lines.push('--- component stack ---');
    lines.push(componentStack.trim());
  }

  return lines.join('\n');
}

/** Best-effort storage usage snapshot — settles the quota question directly. */
async function storageSummary(): Promise<string> {
  const parts: string[] = [];
  try {
    if (navigator.storage?.estimate) {
      const estimate = await navigator.storage.estimate();
      const mb = (n?: number) =>
        n === undefined ? '?' : `${(n / 1024 / 1024).toFixed(2)} MB`;
      parts.push(`storage: ${mb(estimate.usage)} used of ${mb(estimate.quota)} quota`);
      // usageDetails is Chromium-only, and is exactly the per-backend breakdown
      // (indexedDB / caches / serviceWorkerRegistrations) we want here.
      const details = (estimate as any).usageDetails as Record<string, number> | undefined;
      if (details) {
        for (const [k, v] of Object.entries(details)) {
          parts.push(`  ${k}: ${(v / 1024).toFixed(0)} KB`);
        }
      }
    } else {
      parts.push('storage: navigator.storage.estimate() unavailable');
    }
  } catch (e) {
    parts.push(`storage: estimate failed (${String(e)})`);
  }

  try {
    let bytes = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      bytes += key.length + (localStorage.getItem(key)?.length ?? 0);
    }
    parts.push(`localStorage: ${localStorage.length} keys, ~${(bytes / 1024).toFixed(0)} KB`);
  } catch (e) {
    parts.push(`localStorage: inaccessible (${String(e)})`);
  }

  return parts.join('\n');
}

let overlay: HTMLDivElement | null = null;
let body = '';

function ensureOverlay(): HTMLDivElement | null {
  if (!document.body) return null;
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.setAttribute('data-debug-overlay', '');
  overlay.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:2147483647',
    'background:#111', 'color:#eee', 'padding:12px',
    'font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace',
    'overflow:auto', '-webkit-overflow-scrolling:touch',
  ].join(';');

  const bar = document.createElement('div');
  bar.style.cssText = 'display:flex;gap:8px;margin-bottom:10px;position:sticky;top:0;background:#111;padding-bottom:8px';

  const copy = document.createElement('button');
  copy.textContent = 'Copy all';
  copy.style.cssText = 'padding:8px 14px;font:inherit;background:#f60;color:#fff;border:0;border-radius:6px';
  copy.onclick = async () => {
    const text = body;
    try {
      await navigator.clipboard.writeText(text);
      copy.textContent = 'Copied ✓';
    } catch {
      // Clipboard API needs a secure context and a user gesture; fall back.
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); copy.textContent = 'Copied ✓'; }
      catch { copy.textContent = 'Select text manually'; }
      ta.remove();
    }
    setTimeout(() => { copy.textContent = 'Copy all'; }, 2000);
  };

  const close = document.createElement('button');
  close.textContent = 'Dismiss';
  close.style.cssText = 'padding:8px 14px;font:inherit;background:#333;color:#eee;border:0;border-radius:6px';
  close.onclick = () => { overlay?.remove(); overlay = null; };

  bar.append(copy, close);

  const pre = document.createElement('pre');
  pre.setAttribute('data-debug-body', '');
  pre.style.cssText = 'white-space:pre-wrap;word-break:break-word;margin:0;user-select:text';

  overlay.append(bar, pre);
  document.body.appendChild(overlay);
  return overlay;
}

/** Append a report to the overlay, creating it on first use. */
export function reportToOverlay(text: string): void {
  if (!isDebugEnabled()) return;
  body = body ? `${body}\n\n${text}` : text;

  const el = ensureOverlay();
  if (!el) {
    // Body not ready yet — retry once the document is parsed.
    document.addEventListener('DOMContentLoaded', () => reportToOverlay(''), { once: true });
    return;
  }
  const pre = el.querySelector('[data-debug-body]');
  if (pre) pre.textContent = body;
}

/**
 * Install global handlers.
 *
 * Invoked at module scope (bottom of this file) rather than exported for the
 * caller to invoke. That is deliberate: ES module imports are all evaluated
 * before any statement in the importing module's body, so a call like
 * `installDebugOverlay()` in main.tsx would run *after* ./lib/firebase had
 * already been evaluated and had its chance to throw. Installing as a module
 * side effect means import order alone decides, and importing this file first
 * genuinely gets the handlers in place first.
 */
function installDebugOverlay(): void {
  if (!isDebugEnabled()) return;

  window.addEventListener('error', (e: ErrorEvent) => {
    // ResizeObserver noise is filtered elsewhere; keep it out of the report too.
    if (typeof e.message === 'string' && e.message.includes('ResizeObserver')) return;
    reportToOverlay(formatErrorReport('window.onerror', e.error ?? e.message));
  });

  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    reportToOverlay(formatErrorReport('unhandled promise rejection', e.reason));
  });

  // Storage snapshot up front — useful even when nothing throws.
  storageSummary().then(s => reportToOverlay(`--- storage at load ---\n${s}`));
}

installDebugOverlay();
