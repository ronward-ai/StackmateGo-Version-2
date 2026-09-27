/**
 * Which single status the console's app bar reports.
 *
 * Two different facts used to sit side by side in the StackMate Live card's
 * header, and both belong at the top of the screen instead — but neither may be
 * said twice, so the bar shows exactly one and this decides which.
 *
 *   broadcasting — participants can see this game
 *   not-syncing  — this browser cannot reach the database at all
 *   read-only    — another device is driving this game
 *
 * **A blocked browser wins.** It is the one the director has to do something
 * about, and it is also the one that makes the other misleading: a game that is
 * published but not syncing is showing participants a document that has stopped
 * moving. Saying "Broadcasting" there would be a green light over a real fault.
 *
 * **Read-only beats Broadcasting for the same reason, and loses to
 * not-syncing.** A console whose writes are going nowhere must not fly a green
 * flag either — but WHY they are going nowhere matters, and a blocked browser is
 * the only one of the two the director can fix from this device. Being read-only
 * is not a fault at all: the game is being run properly, just not here.
 *
 * Pure, so the ordering is asserted by a test rather than noticed by a reviewer.
 */
export type StatusChip = 'broadcasting' | 'not-syncing' | 'read-only' | null;

export function statusChipFor(input: {
  /** Any of the three conditions that mean writes are not landing. */
  syncBlocked?: boolean;
  /** Published, so participants can reach it. Saved is not live. */
  isLive?: boolean;
  /** Another device holds control, so nothing this one does is saved. */
  readOnly?: boolean;
}): StatusChip {
  if (input.syncBlocked === true) return 'not-syncing';
  if (input.readOnly === true) return 'read-only';
  if (input.isLive === true) return 'broadcasting';
  return null;
}
