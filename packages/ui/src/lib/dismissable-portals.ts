/**
 * Portals whose interactions must not dismiss an open sheet/dialog.
 *
 * Toast and notification portals mount at the document root, outside a Radix
 * layer's DOM subtree. Radix therefore treats clicking one — e.g. pressing a
 * toast's dismiss button — as an "outside" interaction and closes the layer.
 * For sheets guarded by unsaved changes that wrongly raises the
 * "unsaved changes" prompt while the user was only dismissing an error.
 *
 * Matched via the data attributes these portals already render, so this module
 * needs no dependency on any toast library. Any other root-level portal can opt
 * in by setting `data-ignore-outside-dismiss`.
 */
export const IGNORED_OUTSIDE_DISMISS_SELECTOR = [
  '[data-sonner-toaster]',
  '[data-rht-toaster]',
  '[data-ignore-outside-dismiss]',
].join(',');

/**
 * True when a DOM event target sits inside a portal that must not dismiss an
 * open sheet/dialog.
 */
export function isInsideIgnoredDismissPortal(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(IGNORED_OUTSIDE_DISMISS_SELECTOR) !== null;
}
