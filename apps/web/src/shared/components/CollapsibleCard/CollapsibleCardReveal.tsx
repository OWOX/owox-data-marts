import { useContext, useEffect, useRef } from 'react';
import { CollapsibleCardContext } from './CollapsibleCardContext';

/** How long the card is kept at the top while the content above it is still loading. */
const SETTLE_MS = 3000;

/** Input that means the person is moving the page themselves. */
const USER_SCROLL_EVENTS = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;

/**
 * Opens the card it sits in and scrolls the card to the top of the page whenever `navigationKey`
 * changes, without touching the collapsed state the card keeps between visits. No key, no reveal.
 * Place it inside `CollapsibleCardContent`; it renders nothing visible.
 */
export function CollapsibleCardReveal({ navigationKey }: { navigationKey?: string }) {
  const { revealTemporarily } = useContext(CollapsibleCardContext);
  const anchor = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (navigationKey === undefined) return;
    const restore = revealTemporarily?.();
    const scrollToCard = () => {
      anchor.current?.closest('[data-slot="card"]')?.scrollIntoView({ block: 'start' });
    };
    const frame = requestAnimationFrame(scrollToCard);
    // Cards above can still be loading and push this one down. Keep it at the top until they
    // settle, or until the person scrolls on their own.
    const observer =
      typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(scrollToCard);
    observer?.observe(document.body);
    const stop = () => {
      observer?.disconnect();
      for (const event of USER_SCROLL_EVENTS) window.removeEventListener(event, stop);
    };
    for (const event of USER_SCROLL_EVENTS) {
      window.addEventListener(event, stop, { passive: true });
    }
    const timer = window.setTimeout(stop, SETTLE_MS);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      stop();
      restore?.();
    };
  }, [navigationKey, revealTemporarily]);

  return <span ref={anchor} hidden />;
}
