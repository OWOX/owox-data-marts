import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { CollapsibleCard } from './CollapsibleCard';
import { CollapsibleCardContent } from './CollapsibleCardContent';
import { CollapsibleCardReveal } from './CollapsibleCardReveal';

const SAVED_STATE_KEY = 'collapsed-card-output-schema';

function card(navigationKey?: string) {
  return (
    <CollapsibleCard collapsible name='output-schema'>
      <CollapsibleCardContent>
        <CollapsibleCardReveal navigationKey={navigationKey} />
        <p>Schema</p>
      </CollapsibleCardContent>
    </CollapsibleCard>
  );
}

const isOpen = (container: HTMLElement) =>
  container.querySelector('[data-slot="card"] > .grid')?.className.includes('grid-rows-[1fr]');

describe('CollapsibleCardReveal', () => {
  const scrollIntoView = Element.prototype.scrollIntoView;
  const ResizeObserverBefore = globalThis.ResizeObserver;
  let scrolled: HTMLElement[];
  let pageResized: (() => void) | undefined;

  beforeEach(() => {
    localStorage.setItem(SAVED_STATE_KEY, 'true');
    scrolled = [];
    Element.prototype.scrollIntoView = vi.fn(function (this: HTMLElement) {
      scrolled.push(this);
    });
    pageResized = undefined;
    globalThis.ResizeObserver = class {
      constructor(callback: () => void) {
        pageResized = callback;
      }
      observe() {}
      unobserve() {}
      disconnect() {
        pageResized = undefined;
      }
    } as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    Element.prototype.scrollIntoView = scrollIntoView;
    globalThis.ResizeObserver = ResizeObserverBefore;
    localStorage.clear();
  });

  it('opens a collapsed card and scrolls it into view, keeping the saved state collapsed', async () => {
    const { container } = render(card('dm-1:nav-1'));

    expect(isOpen(container)).toBe(true);
    await waitFor(() => {
      expect(scrolled.length).toBeGreaterThan(0);
    });
    expect(scrolled.every(element => element.dataset.slot === 'card')).toBe(true);
    expect(localStorage.getItem(SAVED_STATE_KEY)).toBe('true');
  });

  it('keeps the card in view while the page above it grows, until the person scrolls', async () => {
    render(card('dm-1:nav-1'));
    await waitFor(() => {
      expect(scrolled.length).toBe(1);
    });

    pageResized?.();
    expect(scrolled.length).toBe(2);

    fireEvent.wheel(window);
    expect(pageResized).toBeUndefined();
  });

  it('leaves the card as it was saved without a key', () => {
    const { container } = render(card());

    expect(isOpen(container)).toBe(false);
    expect(scrolled).toEqual([]);
  });

  it('collapses again when the reveal goes away', () => {
    const { container, rerender } = render(card('dm-1:nav-1'));
    expect(isOpen(container)).toBe(true);

    rerender(card());
    expect(isOpen(container)).toBe(false);
  });
});
