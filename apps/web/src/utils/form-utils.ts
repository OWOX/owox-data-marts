/**
 * Creates a mutable copy of form data for safe manipulation.
 * This is commonly used when you need to conditionally modify
 * form data before submission without affecting the original object.
 */
export function createFormPayload<T>(data: T): T {
  return JSON.parse(JSON.stringify(data)) as T;
}

/**
 * Focuses and scrolls to the first form control marked invalid.
 * Pass as the onInvalid handler to react-hook-form's handleSubmit.
 * Collapsed FormSections auto-open on a failed submit, so the invalid field
 * may not be mounted yet when this is called — react-hook-form's built-in
 * shouldFocusError runs too early for such fields. Polls a few frames until
 * the field appears, then gives up silently if none ever does.
 */
const MAX_FOCUS_ATTEMPTS = 20; // ~333 ms at 60 fps

export function focusFirstInvalidField(_errors?: unknown, event?: { target?: unknown }): void {
  let attemptsLeft = MAX_FOCUS_ATTEMPTS;
  const container = event?.target instanceof HTMLElement ? event.target : document;
  const tryFocus = () => {
    const element = container.querySelector('[aria-invalid="true"]');
    if (element instanceof HTMLElement) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.focus({ preventScroll: true });
      return;
    }
    attemptsLeft--;
    if (attemptsLeft > 0) {
      requestAnimationFrame(tryFocus);
    }
  };
  requestAnimationFrame(tryFocus);
}
