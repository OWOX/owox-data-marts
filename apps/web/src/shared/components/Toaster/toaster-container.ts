/**
 * Class applied to the react-hot-toast portal container. Consumers that need to
 * detect whether a DOM event originated inside a toast (e.g. Radix sheets that
 * must not treat a toast dismiss as an outside click) match against this.
 */
export const TOASTER_CONTAINER_CLASS = 'app-toaster';

/**
 * True when a DOM event target sits inside the toast portal — e.g. a click on a
 * toast's dismiss button. Sheets/dialogs use this to avoid treating a toast
 * interaction as an outside click that would close them.
 */
export function isEventTargetInsideToaster(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(`.${TOASTER_CONTAINER_CLASS}`) !== null;
}
