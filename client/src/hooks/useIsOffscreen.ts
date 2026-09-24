import { useEffect, useRef, useState } from 'react';

/**
 * Whether the element the returned ref is attached to has scrolled out of view.
 *
 * Used by the console's app bar to decide when to show the clock: the bar
 * carries it only while `TimerCard` is off screen, so the two are never both
 * visible. Two readouts of one number can only disagree — this is the whole
 * reason the bar's clock is safe.
 *
 * Deliberately an IntersectionObserver rather than a scroll listener. The
 * console re-renders every second because that is how the clock advances, and
 * hanging work off `scroll` on this page is exactly the kind of churn that once
 * had a live game writing to Firestore twice a second.
 *
 * Starts `false`, so nothing flashes into the bar before the first observation
 * — the element is on screen at the top of the page, which is where a director
 * arrives.
 */
export function useIsOffscreen<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null);
  const [offscreen, setOffscreen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) => setOffscreen(!entry.isIntersecting),
      // A sliver still counts as on screen. Swapping the bar the instant the
      // last pixel leaves would flicker while a thumb hovers at the boundary.
      { threshold: 0, rootMargin: '-8px 0px 0px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, offscreen };
}
