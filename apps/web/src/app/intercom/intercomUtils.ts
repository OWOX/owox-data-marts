declare global {
  interface Window {
    Intercom?: (...args: unknown[]) => void;
    __intercom_open_on_ready?: boolean;
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

  setIntercomLauncherVisible(false);

  if (window.__intercom_open_on_ready && window.Intercom) {
    try {
      window.Intercom('show');
    } catch (e) {
      console.warn('Failed to show Intercom after boot', e);
    }
    window.__intercom_open_on_ready = false;
  }
}

export function openIntercom(): void {
  if (window.Intercom) {
    try {
      window.Intercom('show');
    } catch (e) {
      console.warn('Intercom show failed', e);
    }
  } else {
    // Intercom boot not finished yet → defer
    window.__intercom_open_on_ready = true;
  }
}
