import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { SHEET } from './exportStyle';

/**
 * Turn a sheet into a PNG and hand it to the director.
 *
 * **The one capture.** There were two, built opposite ways, and each paid for its
 * own strategy: the results export hand-wrote ~130 lines of `createElement` and
 * `cssText` (and therefore needed `TONE_STYLES`, a second copy of the badge
 * palette kept in step by hand), while the standings export photographed the live
 * table and therefore had to unset that element's height and overflow, wait for
 * layout, put them back, and run an `onclone` pass deleting every SVG and button.
 *
 * Mounting a React sheet off-screen costs neither. It is the results strategy
 * with the one thing that made it painful removed: the sheet is JSX with real
 * Tailwind classes, because html2canvas reads COMPUTED styles from a node that is
 * in the document, which is exactly why capturing the live table ever worked.
 *
 * It lives here beside the sheets rather than in `lib/`, deliberately — `lib/` is
 * kept free of React so its tests need no mocking, and this has to mount a root.
 *
 * ## Two things that are load-bearing
 *
 * **The teardown is in a `finally`.** The builder this replaces removed its
 * off-screen node on the happy path only, so a thrown `html2canvas` — out of
 * memory on a long roster, a tainted canvas — left a full DOM tree parked in the
 * document for the life of the page, invisible, with no way for a director to
 * clear it but a reload. A capture that fails must cost nothing but the toast.
 *
 * **Fonts are awaited.** The sheet is the first thing in this app to be measured
 * in px rather than laid out responsively, so arriving a frame before Archivo and
 * JetBrains Mono are ready means capturing the fallback stack — which is the bug
 * the old results export shipped permanently by setting
 * `font-family: system-ui, sans-serif` on its own container.
 */
export interface CaptureOptions {
  filename: string;
  /** Time for layout to settle after the root renders. */
  settleMs?: number;
  /** The longest a capture waits for the sheet's images. */
  imageWaitMs?: number;
}

/** Resolves once every `<img>` under `root` has loaded or failed, or after `timeoutMs`. */
export function imagesSettled(root: ParentNode, timeoutMs: number): Promise<void> {
  const pending = Array.from(root.querySelectorAll('img')).filter(img => !img.complete);
  if (pending.length === 0) return Promise.resolve();
  const each = pending.map(img => new Promise<void>(resolve => {
    img.addEventListener('load', () => resolve(), { once: true });
    img.addEventListener('error', () => resolve(), { once: true });
  }));
  return Promise.race([
    Promise.all(each).then(() => undefined),
    new Promise<void>(resolve => setTimeout(resolve, timeoutMs)),
  ]);
}

export async function captureSheet(
  element: ReactElement,
  { filename, settleMs = 120, imageWaitMs = 3000 }: CaptureOptions,
): Promise<void> {
  const host = document.createElement('div');
  // Off-screen rather than hidden: `display:none` has no layout, so html2canvas
  // would measure nothing. Left at -10000px it is laid out and simply not seen.
  host.style.cssText = 'position:fixed;left:-10000px;top:0;z-index:-1;';
  document.body.appendChild(host);

  const root = createRoot(host);

  try {
    // Committed NOW, not on React's next tick: the image wait below looks for the
    // sheet's <img>s, and a render still pending has none to find.
    flushSync(() => root.render(element));

    // Best effort — `document.fonts` is absent in some test environments, and a
    // capture must never be the thing that throws over a missing API.
    try {
      await (document as any).fonts?.ready;
    } catch {
      /* fall through and capture in whatever face is available */
    }

    // Every image in the sheet must have arrived — the footer's wordmark is
    // one. An image still loading when html2canvas runs is drawn as nothing.
    // Bounded, because a capture must never hang on one.
    await imagesSettled(host, imageWaitMs);

    await new Promise(resolve => setTimeout(resolve, settleMs));

    const { default: html2canvas } = await import('html2canvas');

    // The sheet itself, not the host: the host has no background of its own, and
    // capturing it would put a transparent margin round every image.
    const target = (host.firstElementChild as HTMLElement | null) ?? host;

    const canvas = await html2canvas(target, {
      // The sheet's own page colour, so the canvas and the sheet cannot disagree.
      // The standings export used to pass `#1e1e1e` — the very literal its own
      // even rows were striped with — so in the image every other row dissolved
      // into the backdrop.
      backgroundColor: SHEET.page,
      scale: 2,
      useCORS: true,
      allowTaint: false,
    } as any);

    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL();
    link.click();
  } finally {
    root.unmount();
    host.remove();
  }
}

/**
 * `league-standings-Spring-2026-2026-10-01.png`, and nothing with a slash in it.
 *
 * A season called "Winter 25/26" is completely ordinary, and a slash in a
 * download name is how a file quietly fails to save.
 *
 * The date is appended SEPARATELY from the descriptive parts rather than being
 * one of them, which is what keeps the fallback reachable: with the date in the
 * list, the stem is never empty and a nameless sheet would download as
 * `2026-10-01.png`.
 */
export function sheetFilename(parts: Array<string | null | undefined>): string {
  const date = new Date().toISOString().split('T')[0];
  const described = parts
    .filter((p): p is string => !!p && !!String(p).trim())
    .map(p => String(p).trim().replace(/[^\w-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''))
    .filter(Boolean);
  return `${[...(described.length ? described : ['stackmate']), date].join('-')}.png`;
}
