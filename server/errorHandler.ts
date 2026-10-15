import type { Express, NextFunction, Request, Response } from "express";

/**
 * The last word on any request that threw.
 *
 * It used to send `err.message` back for EVERY error, whatever the status. A
 * client error from the body parser is worth saying ("request entity too
 * large"), but a 500 carries whatever the code that threw happened to put in
 * its message — a file path, a library's internals, a configuration detail —
 * and that is not the caller's business. So: a 4xx the library marked safe to
 * show (`expose`) keeps its message; everything else is a fixed sentence, and
 * the real message goes to the log. Never a stack trace either way.
 */
export function installErrorHandler(app: Express): void {
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const raw = Number(err?.status || err?.statusCode);
    const status = raw >= 400 && raw < 600 ? raw : 500;
    console.error('Server error:', err?.message || err);
    if (res.headersSent) return;
    const message = status < 500 && err?.expose ? String(err.message) : status < 500 ? 'Bad request' : 'Internal Server Error';
    res.status(status).json({ message });
  });
}
