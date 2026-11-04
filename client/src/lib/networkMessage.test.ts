import { describe, it, expect } from 'vitest';
import { friendlyNetworkError, BLOCKED_SIGN_IN_MESSAGE } from './networkMessage';

describe('friendlyNetworkError', () => {
  it('turns a blocked sign-in into a sentence a director can act on', () => {
    // A message that does not repeat the code, so this pins the code check itself.
    expect(friendlyNetworkError({ code: 'auth/network-request-failed', message: 'A network error occurred.' }))
      .toBe(BLOCKED_SIGN_IN_MESSAGE);
  });

  it('recognises the code inside a message too, as Firebase spells it', () => {
    expect(friendlyNetworkError(new Error('Firebase: Error (auth/network-request-failed).'))).toBe(BLOCKED_SIGN_IN_MESSAGE);
  });

  it('keeps any other error its own words', () => {
    expect(friendlyNetworkError(new Error('Could not publish the game. Please try again.')))
      .toBe('Could not publish the game. Please try again.');
  });

  it('never shows an empty toast', () => {
    expect(friendlyNetworkError(null)).toBe('Something went wrong. Please try again.');
    expect(friendlyNetworkError({})).toBe('Something went wrong. Please try again.');
  });
});
