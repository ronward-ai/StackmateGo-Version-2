/**
 * How the app says something out loud.
 *
 * ONE place builds a `SpeechSynthesisUtterance`. Six sites used to build their
 * own and had already drifted: the 30-second warning was set at volume 0.7
 * while everything else was at 1.0, and exactly one of them set `lang`. On a
 * device with several installed voices that meant the warning could be spoken
 * by a different voice from the level change that followed it seconds later.
 *
 * NO VOICE IS SELECTED, deliberately. `speechSynthesis` picks the platform
 * default for the language, which is why the same game sounds male on an iPad
 * and female on Android. Choosing one would mean a per-device picker — the
 * installed voices differ between devices, so a choice made on one could not
 * travel to the other — and the announcements are already consistent on any
 * given device. If that is ever wanted, it belongs here and nowhere else.
 */

/** Every announcement is spoken at this rate, volume and language. */
const RATE = 0.8;
const VOLUME = 1.0;
const LANG = 'en-US';

export interface SpeakOptions {
  /** Drop anything queued or in progress first. */
  cancel?: boolean;
  /**
   * Wait before speaking. The delays are per-call because they are genuinely
   * different: the level change waits for the level-complete chimes to finish,
   * the 30-second warning waits out its own two-tone chime.
   */
  delayMs?: number;
}

export function speak(text: string, options: SpeakOptions = {}): void {
  if (!text) return;
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

  const utter = () => {
    try {
      if (options.cancel && (speechSynthesis.speaking || speechSynthesis.pending)) {
        speechSynthesis.cancel();
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = RATE;
      utterance.volume = VOLUME;
      utterance.pitch = 1.0;
      utterance.lang = LANG;
      speechSynthesis.speak(utterance);
    } catch {
      // A browser without speech synthesis, or one refusing it without a user
      // gesture. The game carries on either way.
    }
  };

  if (options.delayMs) {
    setTimeout(utter, options.delayMs);
  } else {
    utter();
  }
}
