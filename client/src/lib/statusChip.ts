/**
 * Which single status the console's app bar reports.
 *
 * Two different facts used to sit side by side in the StackMate Live card's
 * header, and both belong at the top of the screen instead — but neither may be
 * said twice, so the bar shows exactly one and this decides which.
 *
 *   broadcasting — participants can see this game
 *   not-syncing  — this browser cannot reach the database at all
 *
 * **A blocked browser wins.** It is the one the director has to do something
 * about, and it is also the one that makes the other misleading: a game that is
 * published but not syncing is showing participants a document that has stopped
 * moving. Saying "Broadcasting" there would be a green light over a real fault.
 *
 * Pure, so the ordering is asserted by a test rather than noticed by a reviewer.
 */
export type StatusChip = 'broadcasting' | 'not-syncing' | null;

export function statusChipFor(input: {
  /** Any of the three conditions that mean writes are not landing. */
  syncBlocked?: boolean;
  /** Published, so participants can reach it. Saved is not live. */
  isLive?: boolean;
}): StatusChip {
  if (input.syncBlocked === true) return 'not-syncing';
  if (input.isLive === true) return 'broadcasting';
  return null;
}
