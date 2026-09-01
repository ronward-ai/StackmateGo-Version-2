import { auth } from '@/lib/firebase';

/**
 * Calls to this app's own Express server.
 *
 * Empty base resolves same-origin, which is the normal case: `server/index.ts`
 * serves the built client, so `/api/*` is always reachable from wherever the
 * app is loaded. `VITE_API_BASE_URL` only matters when the client is served
 * from somewhere other than the API — matching the pattern already used in
 * `components/UpgradeModal.tsx`.
 */
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

/**
 * POST JSON to an API route, authenticated as the current Firebase user.
 *
 * The caller's identity travels as a verified ID token, never as a uid in the
 * body — a client that could name its own uid could hand itself any tournament.
 * The server rejects the request with 401 when the header is absent or the
 * token does not verify.
 */
export async function apiFetch(path: string, body: unknown): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  const token = await auth.currentUser?.getIdToken().catch(() => undefined);
  if (token) headers.Authorization = `Bearer ${token}`;

  return fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}
