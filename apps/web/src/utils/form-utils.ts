import type { FieldPath, FieldValues, UseFormSetError } from 'react-hook-form';

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

/**
 * Puts the errors a rejected save names onto the inputs that hold those values, so the form
 * highlights what to fix exactly as it does for its own validation — red field, message under
 * it, section opened. `toFormField` maps a request path (`config.projectId`) to the form field
 * that shows it, or `null` when no input does. Several request values can land on one input
 * (every key of a pasted JSON file), so their messages are joined, each naming its key.
 *
 * Returns whether any field got an error, i.e. whether there is something to focus.
 */
export function applyServerFieldErrors<T extends FieldValues>(
  setError: UseFormSetError<T>,
  fieldErrors: readonly { field: string; message: string }[],
  toFormField: (field: string) => FieldPath<T> | null
): boolean {
  const messagesByField = new Map<FieldPath<T>, string[]>();
  for (const { field, message } of fieldErrors) {
    const name = toFormField(field);
    if (!name) continue;
    // On an input named for another key (one holding a whole file), a bare reason does not say
    // which of the file's keys is wrong. A list index is not a key: `credentials.to.0` is the
    // `to` list's input, whichever entry was refused.
    const key = lastKeyOf(field);
    const holdsOtherKey = key !== '' && lastKeyOf(name) !== key;
    const text = holdsOtherKey && !message.includes(key) ? `${key}: ${message}` : message;
    const messages = messagesByField.get(name) ?? [];
    if (!messages.includes(text)) messages.push(text);
    messagesByField.set(name, messages);
  }
  for (const [name, messages] of messagesByField) {
    setError(name, { type: 'server', message: messages.join('; ') });
  }
  return messagesByField.size > 0;
}

/** The last named segment of a dot path, skipping list indexes. */
function lastKeyOf(path: string): string {
  return (
    path
      .split('.')
      .filter(segment => !/^\d+$/.test(segment))
      .at(-1) ?? ''
  );
}
