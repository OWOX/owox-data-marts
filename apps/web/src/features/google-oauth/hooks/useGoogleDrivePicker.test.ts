// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getPickerDialogSize,
  useGoogleSheetsPicker,
  validateGoogleSheetsPickerScopes,
  verifyGooglePickerAccount,
} from './useGoogleDrivePicker';

const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const USERINFO_EMAIL_SCOPE = 'https://www.googleapis.com/auth/userinfo.email';

describe('validateGoogleSheetsPickerScopes', () => {
  it('accepts the required Picker permissions', () => {
    expect(() => {
      validateGoogleSheetsPickerScopes(`${DRIVE_FILE_SCOPE} ${USERINFO_EMAIL_SCOPE}`);
    }).not.toThrow();
  });

  it('rejects a partial Google grant', () => {
    expect(() => {
      validateGoogleSheetsPickerScopes(USERINFO_EMAIL_SCOPE);
    }).toThrow('Google Sheets access was not fully granted');
  });
});

describe('getPickerDialogSize', () => {
  it('uses the Picker maximum in a large window', () => {
    expect(getPickerDialogSize({ innerWidth: 1920, innerHeight: 1080 })).toEqual({
      width: 1051,
      height: 650,
    });
  });

  it('shrinks the dialog to a short or narrow window so the header stays visible', () => {
    expect(getPickerDialogSize({ innerWidth: 960, innerHeight: 560 })).toEqual({
      width: 928,
      height: 528,
    });
  });

  it('never goes below the size Picker itself enforces', () => {
    expect(getPickerDialogSize({ innerWidth: 400, innerHeight: 300 })).toEqual({
      width: 566,
      height: 350,
    });
  });
});

describe('verifyGooglePickerAccount', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requires connected-account metadata', async () => {
    await expect(verifyGooglePickerAccount('access-token')).rejects.toThrow(
      'Reconnect Google Sheets before choosing a spreadsheet'
    );
  });

  it('accepts the same Google account case-insensitively', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ email: 'Analyst@Example.com' }), { status: 200 })
    );

    await expect(
      verifyGooglePickerAccount('access-token', 'analyst@example.com')
    ).resolves.toBeUndefined();
  });

  it('rejects a Picker token issued for a different Google account', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ email: 'other@example.com' }), { status: 200 })
    );

    await expect(verifyGooglePickerAccount('access-token', 'analyst@example.com')).rejects.toThrow(
      'Open Google Picker with the connected account analyst@example.com'
    );
  });
});

describe('useGoogleSheetsPicker', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (window as unknown as { gapi?: unknown }).gapi;
    delete (window as unknown as { google?: unknown }).google;
  });

  it('reports when the Picker module does not initialize', async () => {
    vi.useFakeTimers();
    (window as unknown as { gapi: { load: () => void } }).gapi = {
      load: vi.fn(),
    };
    const onError = vi.fn();
    const { result } = renderHook(() => useGoogleSheetsPicker());

    const opening = result.current.openPicker({
      apiKey: 'api-key',
      appId: 'project-number',
      clientId: 'client-id',
      onPicked: vi.fn(),
      onError,
    });

    await vi.advanceTimersByTimeAsync(10000);
    await opening;

    expect(onError).toHaveBeenCalledWith('Google Picker failed to initialize. Please try again.');
  });

  it('closes the active Picker when the component unmounts', async () => {
    const setVisible = vi.fn();
    const dispose = vi.fn();
    const onPicked = vi.fn();
    let pickerCallback: ((response: { action: string; docs?: unknown[] }) => void) | undefined;
    let pickerSize: { width: number; height: number } | undefined;
    const requestAccessToken = vi.fn();
    const initTokenClient = vi.fn(
      (config: { callback: (response: Record<string, unknown>) => void }) => {
        requestAccessToken.mockImplementation(() => {
          config.callback({
            access_token: 'access-token',
            scope: `${DRIVE_FILE_SCOPE} ${USERINFO_EMAIL_SCOPE}`,
          });
        });
        return { requestAccessToken };
      }
    );

    class DocsView {
      setMimeTypes() {
        return this;
      }
      setMode() {
        return this;
      }
    }

    class PickerBuilder {
      setOAuthToken() {
        return this;
      }
      setDeveloperKey() {
        return this;
      }
      setAppId() {
        return this;
      }
      addView() {
        return this;
      }
      enableFeature() {
        return this;
      }
      setSize(width: number, height: number) {
        pickerSize = { width, height };
        return this;
      }
      setCallback(callback: (response: { action: string; docs?: unknown[] }) => void) {
        pickerCallback = callback;
        return this;
      }
      build() {
        return { setVisible, dispose };
      }
    }

    (window as unknown as { gapi: { load: (_api: string, callback: () => void) => void } }).gapi = {
      load: (_api, callback) => {
        callback();
      },
    };
    (
      window as unknown as {
        google: {
          accounts: { oauth2: { initTokenClient: typeof initTokenClient } };
          picker: Record<string, unknown>;
        };
      }
    ).google = {
      accounts: { oauth2: { initTokenClient } },
      picker: {
        PickerBuilder,
        DocsView,
        ViewId: { SPREADSHEETS: 'spreadsheets' },
        DocsViewMode: { LIST: 'list' },
        Action: { PICKED: 'picked', CANCEL: 'cancel' },
        Feature: { SUPPORT_DRIVES: 'support-drives' },
      },
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ email: 'analyst@example.com' }), { status: 200 })
    );

    const { result, unmount } = renderHook(() => useGoogleSheetsPicker());
    const opening = result.current.openPicker({
      apiKey: 'api-key',
      appId: 'project-number',
      clientId: 'client-id',
      hintEmail: 'analyst@example.com',
      onPicked,
    });

    await vi.waitFor(() => {
      expect(setVisible).toHaveBeenCalledWith(true);
    });
    expect(initTokenClient).toHaveBeenCalledWith(
      expect.objectContaining({ login_hint: 'analyst@example.com' })
    );
    expect(requestAccessToken).toHaveBeenCalledWith({ login_hint: 'analyst@example.com' });
    expect(pickerSize).toEqual(getPickerDialogSize(window));

    unmount();
    await opening;

    expect(setVisible).toHaveBeenLastCalledWith(false);
    expect(dispose).toHaveBeenCalledOnce();

    pickerCallback?.({
      action: 'picked',
      docs: [{ id: 'sheet-id', name: 'Sheet', url: 'https://example.com' }],
    });
    expect(onPicked).not.toHaveBeenCalled();
  });
});
