const FIELD_SELECTOR = [
  'input:not([type="hidden"]):not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[role="combobox"]:not([disabled])',
].join(',');
const BUTTON_SELECTOR = 'button:not([disabled])';

/**
 * An `onOpenAutoFocus` handler: focuses the first enabled field inside the form of a dialog,
 * or the dialog itself. Without a form it does nothing, so the dialog keeps its default focus.
 */
export function focusFirstFormField(event: Event): void {
  const dialog = event.currentTarget as HTMLElement;
  const form = dialog.querySelector('form');
  if (!form) return;
  event.preventDefault();
  // A section toggle button can precede the first input, so buttons are the last resort.
  const field =
    form.querySelector<HTMLElement>(FIELD_SELECTOR) ??
    form.querySelector<HTMLElement>(BUTTON_SELECTOR);
  (field ?? dialog).focus({ preventScroll: true });
}
