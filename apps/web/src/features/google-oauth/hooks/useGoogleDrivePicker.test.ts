// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
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
    delete (window as unknown as { gapi?: unknown }).gapi;
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
});
