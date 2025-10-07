declare global {
  interface Window {
    Intercom?: (...args: unknown[]) => void;
  }
}

const INTERCOM_LAUNCHER_HORIZONTAL_PADDING = 20;
const INTERCOM_LAUNCHER_VERTICAL_PADDING = 20;

export function setIntercomPadding({
  vertical,
  horizontal,
}: {
  vertical: number;
  horizontal: number;
}): void {
  if (!window.Intercom) return;

  try {
    const payload: Record<string, number> = {};

    payload.vertical_padding = vertical;
    payload.horizontal_padding = horizontal;

    if (Object.keys(payload).length > 0) {
      window.Intercom('update', payload);
    }
  } catch (e) {
    console.warn('Failed to update Intercom padding', e);
  }
}

export function setIntercomLauncherVisible(visible: boolean): void {
  try {
    if (!window.Intercom) return;
    window.Intercom('update', { hide_default_launcher: !visible });
  } catch (e) {
    console.warn('Failed to toggle Intercom launcher visibility', e);
  }
}

export function raiseIntercomLauncher(extraVertical = 30, extraHorizontal = 0): void {
  setIntercomPadding({
    vertical: INTERCOM_LAUNCHER_VERTICAL_PADDING + extraVertical,
    horizontal: INTERCOM_LAUNCHER_HORIZONTAL_PADDING + extraHorizontal,
  });
}

export function resetIntercomLauncher(): void {
  setIntercomPadding({
    vertical: INTERCOM_LAUNCHER_VERTICAL_PADDING,
    horizontal: INTERCOM_LAUNCHER_HORIZONTAL_PADDING,
  });
}
