import type { Express } from "express";

/**
 * Headers every response carries (October audit, Low).
 *
 * The console could be FRAMED by any site: Take control and Go Live are single
 * presses, which is exactly what clickjacking needs. `X-Frame-Options` is the
 * old spelling and CSP `frame-ancestors` the current one; both are sent because
 * they cost nothing and older browsers know only the first.
 *
 * Deliberately NOT a full Content-Security-Policy yet. Firebase, Google Fonts,
 * Stripe and the inline styles html2canvas leans on would each need an entry,
 * and a CSP that is wrong breaks the app silently on the one device nobody
 * tested. `frame-ancestors` alone has no such risk: it restricts who may embed
 * the page, not what the page may load.
 *
 * HSTS is honoured only over HTTPS, which is all Railway serves, so local
 * development over plain http is unaffected.
 */
export const SECURITY_HEADERS: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "frame-ancestors 'none'",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

export function installSecurityHeaders(app: Express): void {
  app.use((_req, res, next) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);
    next();
  });
}
