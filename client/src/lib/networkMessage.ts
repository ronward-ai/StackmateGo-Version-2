/**
 * What to tell a director when saving or publishing fails, in words they can act
 * on at the table.
 *
 * `auth/network-request-failed` is Firebase Auth failing to reach Google's
 * sign-in servers — reported from a live night, where the venue Wi-Fi let the
 * page load and blocked those servers, so Go Live failed with the raw code on
 * screen. It is a fact about the network, not the app, and the one thing that
 * fixes it is a different network. The game is still on this device (the local
 * mirror), which is the other thing a director needs to hear at that moment.
 *
 * Any other error keeps its own message: those already say what went wrong.
 */
export const BLOCKED_SIGN_IN_MESSAGE =
  "This network is blocking Google's sign-in servers. Switch to mobile data or a hotspot, " +
  'then try again — your game is safe on this device.';

export function friendlyNetworkError(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  const message = (error as { message?: unknown } | null)?.message;
  if (code === 'auth/network-request-failed') return BLOCKED_SIGN_IN_MESSAGE;
  if (typeof message === 'string' && message.includes('auth/network-request-failed')) return BLOCKED_SIGN_IN_MESSAGE;
  if (typeof message === 'string' && message) return message;
  return 'Something went wrong. Please try again.';
}
