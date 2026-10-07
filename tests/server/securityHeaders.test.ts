// @vitest-environment node
import { describe, it, expect } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'net';
import { installSecurityHeaders } from '../../server/securityHeaders';

/** October audit, Low: the console could be framed by any site. */
describe('security headers', () => {
  it('forbid framing on every response, including a 404', async () => {
    const app = express();
    installSecurityHeaders(app);
    app.get('/x', (_req, res) => res.send('ok'));
    const server = await new Promise<ReturnType<typeof app.listen>>(r => { const s = app.listen(0, () => r(s)); });
    const { port } = server.address() as AddressInfo;
    try {
      for (const path of ['/x', '/missing']) {
        const res = await fetch(`http://127.0.0.1:${port}${path}`);
        expect(res.headers.get('x-frame-options')).toBe('DENY');
        expect(res.headers.get('strict-transport-security')).toMatch(/max-age=\d+/);
      }
      // Express's own 404 swaps in a stricter `default-src 'none'`, so the CSP
      // is asserted on a real page.
      const page = await fetch(`http://127.0.0.1:${port}/x`);
      expect(page.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    } finally {
      await new Promise<void>(r => server.close(() => r()));
    }
  });
});
