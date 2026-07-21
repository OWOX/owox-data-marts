import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { isInsideIgnoredDismissPortal } from '@owox/ui/lib/dismissable-portals';
import { Toaster as HotToaster } from './index';

/**
 * Sheets close on any interaction outside their DOM subtree. Toasts render in
 * their own root-level portal, so dismissing an error toast used to close the
 * open sheet and — for sheets guarded by unsaved changes — wrongly raise the
 * "unsaved changes" prompt. SheetContent now ignores interactions coming from
 * toast portals.
 *
 * These tests pin the real markup both toast libraries render, so a library
 * upgrade that changes the container attribute fails here instead of silently
 * bringing the bug back.
 */
describe('toast portals are ignored by the sheet outside-dismiss guard', () => {
  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
  });

  it('recognises the react-hot-toast portal the app renders', () => {
    render(<HotToaster />);

    const portal = document.querySelector('[data-rht-toaster]');
    expect(portal).not.toBeNull();

    // Stand in for a toast's dismiss button.
    const dismissButton = document.createElement('button');
    portal?.appendChild(dismissButton);

    expect(isInsideIgnoredDismissPortal(dismissButton)).toBe(true);
  });

  // Sonner only mounts its container once a toast exists, and it is a
  // packages/ui dependency rather than an app one, so its markup is asserted
  // against the attribute it documents instead of a live render.
  it('recognises the sonner portal', () => {
    const portal = document.createElement('ol');
    portal.setAttribute('data-sonner-toaster', 'true');
    const dismissButton = document.createElement('button');
    portal.appendChild(dismissButton);
    document.body.appendChild(portal);

    expect(isInsideIgnoredDismissPortal(dismissButton)).toBe(true);
  });

  it('still treats interactions outside any toast portal as a genuine outside click', () => {
    const elsewhere = document.createElement('div');
    document.body.appendChild(elsewhere);

    expect(isInsideIgnoredDismissPortal(elsewhere)).toBe(false);
    expect(isInsideIgnoredDismissPortal(null)).toBe(false);
  });

  it('lets any other root-level portal opt out of dismissing sheets', () => {
    const portal = document.createElement('div');
    portal.setAttribute('data-ignore-outside-dismiss', '');
    const child = document.createElement('span');
    portal.appendChild(child);
    document.body.appendChild(portal);

    expect(isInsideIgnoredDismissPortal(child)).toBe(true);
  });
});
