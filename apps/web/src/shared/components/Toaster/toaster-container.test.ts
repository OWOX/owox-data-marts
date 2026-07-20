import { afterEach, describe, it, expect } from 'vitest';
import { isEventTargetInsideToaster, TOASTER_CONTAINER_CLASS } from './toaster-container';

/**
 * Guards the toast-vs-sheet interaction fix: a click inside the toast portal
 * must be recognised so sheets don't treat a toast dismiss as an outside click
 * (which would close the sheet and trigger the unsaved-changes prompt).
 */
describe('isEventTargetInsideToaster', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('returns true for a target nested inside the toaster container', () => {
    const container = document.createElement('div');
    container.className = TOASTER_CONTAINER_CLASS;
    const dismissButton = document.createElement('button');
    container.appendChild(dismissButton);
    document.body.appendChild(container);

    expect(isEventTargetInsideToaster(dismissButton)).toBe(true);
  });

  it('returns true when the target is the toaster container itself', () => {
    const container = document.createElement('div');
    container.className = TOASTER_CONTAINER_CLASS;
    document.body.appendChild(container);

    expect(isEventTargetInsideToaster(container)).toBe(true);
  });

  it('returns false for a target outside the toaster container', () => {
    const outside = document.createElement('div');
    document.body.appendChild(outside);

    expect(isEventTargetInsideToaster(outside)).toBe(false);
  });

  it('returns false for null or a non-Element target', () => {
    expect(isEventTargetInsideToaster(null)).toBe(false);
    // e.g. a focus/selection event whose target is not an Element
    expect(isEventTargetInsideToaster(new EventTarget())).toBe(false);
  });
});
