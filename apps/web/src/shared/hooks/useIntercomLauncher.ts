import { useEffect } from 'react';
import { raiseIntercomLauncher, resetIntercomLauncher } from '../../app/intercom/intercomUtils';

interface UseIntercomLauncherOptions {
  vertical?: number;
  horizontal?: number;
}

/**
 * React hook to manage the Intercom Launcher visibility and position
 * when a modal-like component (e.g., Sheet) is opened or closed.
 *
 * Calls `raiseIntercomLauncher` when the component opens and
 * `resetIntercomLauncher` when it closes or unmounts.
 *
 * @param isOpen - Whether the component (Sheet) is currently open
 * @param options.vertical - Optional extra vertical offset in pixels
 * @param options.horizontal - Optional extra horizontal offset in pixels
 *
 * @example
 * useIntercomLauncher(isOpen);
 *
 * // With custom offsets
 * useIntercomLauncher(isOpen, { vertical: 10, horizontal: 500 });
 */
export function useIntercomLauncher(isOpen: boolean, options?: UseIntercomLauncherOptions) {
  const vertical = options?.vertical ?? 0;
  const horizontal = options?.horizontal ?? 600;

  useEffect(() => {
    if (isOpen) {
      raiseIntercomLauncher(vertical, horizontal);
    } else {
      resetIntercomLauncher();
    }

    return () => {
      resetIntercomLauncher();
    };
  }, [isOpen, vertical, horizontal]);
}
