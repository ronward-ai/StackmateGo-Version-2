/**
 * Shrinking an uploaded logo so it cannot break the tournament.
 *
 * The logo is read as a data URL, kept in `settings.branding.logoUrl`, and
 * `PokerTimer` syncs the whole `settings` object into the tournament document.
 * Nothing bounded it. A 4 MB photo from a phone's camera roll becomes about
 * 5.4 MB of base64, and **Firestore rejects any document over 1 MiB** — so the
 * write fails, and it is the WHOLE tournament document that fails, not just the
 * logo. The director sees a game that will not save and nothing on screen
 * connects that to the picture they just picked. The same string is written to
 * localStorage, which has its own ~5 MB ceiling, and re-downloaded by every
 * participant on every snapshot.
 *
 * So the file is drawn into a canvas at a bounded size and re-encoded before it
 * is ever stored. The arithmetic lives in `fitWithin`, which is pure and tested;
 * the canvas work around it is deliberately thin, because a jsdom test of a real
 * canvas proves nothing a browser would agree with.
 *
 * WebP first, because it keeps transparency — a logo re-encoded as JPEG gains a
 * black or white box behind it, which on the participant's dark screen is worse
 * than no logo. Browsers that cannot encode WebP hand back a PNG from
 * `toDataURL`, which is detectable from the prefix rather than by feature test.
 */

/** Longest edge, in CSS pixels. A logo is drawn at most a few hundred px wide. */
export const MAX_LOGO_EDGE = 512;

/**
 * Bytes a stored logo may occupy, base64 included.
 *
 * Well under Firestore's 1 MiB, because the logo shares that budget with the
 * roster, the blind structure and every setting — and the roster grows all
 * night while the logo does not.
 */
export const MAX_LOGO_BYTES = 150_000;

/** Quality ladder, walked down until the result fits the budget. */
const QUALITY_STEPS = [0.85, 0.7, 0.55, 0.4];

export interface Size { width: number; height: number }

/**
 * Scale a size down to fit inside a square of `maxEdge`, preserving aspect.
 *
 * Never scales UP — a small logo stays its own size rather than being blown up
 * and re-encoded into something larger than it started. Rounds to whole pixels
 * and never returns zero, since a canvas of zero width throws.
 */
export function fitWithin(size: Size, maxEdge: number): Size {
  const { width, height } = size;
  if (!(width > 0) || !(height > 0)) return { width: 1, height: 1 };
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width: Math.round(width), height: Math.round(height) };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Roughly how many bytes a data URL occupies.
 *
 * Base64 carries 3 bytes in every 4 characters, minus the padding. The header
 * is counted too because the whole string is what gets stored.
 */
export function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  if (comma === -1) return dataUrl.length;
  const payload = dataUrl.length - comma - 1;
  const padding = dataUrl.endsWith('==') ? 2 : dataUrl.endsWith('=') ? 1 : 0;
  return Math.ceil(payload * 3 / 4) - padding + comma + 1;
}

/** Read a File as a data URL. */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('That file could not be read.'));
    reader.readAsDataURL(file);
  });
}

/** Decode a data URL into an image element. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('That file is not an image the browser can read.'));
    img.src = src;
  });
}

export interface DownscaleResult {
  /** The data URL to store. */
  dataUrl: string;
  /** Approximate stored size, so a caller can report it. */
  bytes: number;
  /** True when the image was actually resized or re-encoded. */
  changed: boolean;
}

/**
 * Shrink an uploaded image to something safe to store.
 *
 * Throws with a message meant to be shown to the director if the picture cannot
 * be brought under budget — which in practice means a photograph rather than a
 * logo. Refusing loudly is the point: the alternative is the silent, whole-game
 * write failure this exists to prevent.
 */
export async function downscaleImage(
  file: File,
  { maxEdge = MAX_LOGO_EDGE, maxBytes = MAX_LOGO_BYTES } = {},
): Promise<DownscaleResult> {
  const original = await readAsDataUrl(file);
  const img = await loadImage(original);

  const target = fitWithin({ width: img.naturalWidth, height: img.naturalHeight }, maxEdge);
  const canvas = document.createElement('canvas');
  canvas.width = target.width;
  canvas.height = target.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    // No canvas: fall back to the original, but only if it is already safe.
    const bytes = dataUrlBytes(original);
    if (bytes <= maxBytes) return { dataUrl: original, bytes, changed: false };
    throw new Error('That image is too large and this browser cannot resize it.');
  }
  ctx.drawImage(img, 0, 0, target.width, target.height);

  let best: string | null = null;
  for (const quality of QUALITY_STEPS) {
    const encoded = canvas.toDataURL('image/webp', quality);
    // A browser that cannot encode WebP silently returns a PNG. PNG ignores the
    // quality argument, so walking the ladder would just repeat one result.
    const isPng = encoded.startsWith('data:image/png');
    best = encoded;
    if (dataUrlBytes(encoded) <= maxBytes) break;
    if (isPng) {
      // Try JPEG instead, accepting the loss of transparency rather than
      // failing outright — a flattened logo beats a game that will not save.
      for (const jpegQuality of QUALITY_STEPS) {
        const jpeg = canvas.toDataURL('image/jpeg', jpegQuality);
        best = jpeg;
        if (dataUrlBytes(jpeg) <= maxBytes) break;
      }
      break;
    }
  }

  const dataUrl = best || original;
  const bytes = dataUrlBytes(dataUrl);
  if (bytes > maxBytes) {
    throw new Error(
      `That image is still ${Math.round(bytes / 1024)}KB after resizing, and the limit is `
      + `${Math.round(maxBytes / 1024)}KB. A logo works better than a photograph here.`,
    );
  }
  return { dataUrl, bytes, changed: dataUrl !== original };
}
