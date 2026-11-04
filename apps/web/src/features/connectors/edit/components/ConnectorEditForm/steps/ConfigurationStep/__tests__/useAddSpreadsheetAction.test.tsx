import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpenGoogleSheetsPickerOptions } from '../../../../../../../google-oauth';
import { useAddSpreadsheetAction } from '../useAddSpreadsheetAction';

const credentialsState = vi.hoisted(() => ({
  credentials: [] as unknown[],
  isPending: false,
  isSuccess: true,
}));
vi.mock('../../../../../../../credentials/useCredentials', () => ({
  useCredentials: () => credentialsState,
}));

const oauth = vi.hoisted(() => ({ getSettings: vi.fn() }));
vi.mock('../../../../../../shared/model/hooks/useOAuth', () => ({
  useOAuth: () => oauth,
}));

const picker = vi.hoisted(() => ({ openPicker: vi.fn() }));
vi.mock('../../../../../../../google-oauth', () => ({
  preloadGoogleSheetsPicker: vi.fn(),
  useGoogleSheetsPicker: () => picker,
}));

const toastError = vi.hoisted(() => vi.fn());
vi.mock('react-hot-toast', () => ({ toast: { error: toastError } }));

const UNAVAILABLE_HINT = 'Spreadsheets cannot be added right now. Reload the page and try again.';
const SETTINGS = {
  vars: { PickerApiKey: 'key-1', ProjectNumber: '123', ClientId: 'client-1' },
  isEnabled: true,
};

function credential(
  overrides: Record<string, unknown> = {},
  email: string | null = 'a@example.com'
) {
  return {
    id: 'cred-1',
    canUse: true,
    publicMetadata: {
      fields: {},
      connection: { account: { id: 'g-1', name: 'A', email }, expiresAt: null },
    },
    ...overrides,
  };
}

function hookFor(credentialId: string | null, onPicked = vi.fn()) {
  return renderHook(() => useAddSpreadsheetAction(credentialId, onPicked)).result;
}

describe('useAddSpreadsheetAction', () => {
  beforeEach(() => {
    credentialsState.credentials = [];
    credentialsState.isPending = false;
    credentialsState.isSuccess = true;
    vi.clearAllMocks();
  });

  it('offers nothing without a Credential', () => {
    expect(hookFor(null).current).toBeUndefined();
  });

  it("opens Picker through Google Identity Services for the Credential's account", async () => {
    credentialsState.credentials = [credential()];
    oauth.getSettings.mockResolvedValue(SETTINGS);
    picker.openPicker.mockImplementation(async (options: OpenGoogleSheetsPickerOptions) => {
      options.onPicked({ id: 'id-9', name: 'Budget', url: 'https://docs.google.com/x' });
    });
    const onPicked = vi.fn();
    const result = hookFor('cred-1', onPicked);

    expect(result.current).toMatchObject({ label: '+ Add spreadsheet' });
    expect(result.current?.disabled).toBeFalsy();

    await act(async () => {
      await result.current?.onSelect();
    });

    expect(oauth.getSettings).toHaveBeenCalledWith('GoogleSheets', 'AuthType.oauth2');
    expect(picker.openPicker).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'key-1',
        appId: '123',
        clientId: 'client-1',
        hintEmail: 'a@example.com',
      })
    );
    const options = picker.openPicker.mock.calls[0][0] as OpenGoogleSheetsPickerOptions;
    expect(options.accessToken).toBeUndefined();
    expect(onPicked).toHaveBeenCalledWith('https://docs.google.com/x', 'Budget');
  });

  it('reports a Picker error with a toast', async () => {
    credentialsState.credentials = [credential()];
    oauth.getSettings.mockResolvedValue(SETTINGS);
    picker.openPicker.mockImplementation(async (options: OpenGoogleSheetsPickerOptions) => {
      options.onError?.('Sign in to Google as a@example.com to add spreadsheets.');
    });
    const result = hookFor('cred-1');

    await act(async () => {
      await result.current?.onSelect();
    });

    expect(toastError).toHaveBeenCalledWith(
      'Sign in to Google as a@example.com to add spreadsheets.'
    );
  });

  it('reports an incomplete Picker configuration and opens no Picker', async () => {
    credentialsState.credentials = [credential()];
    oauth.getSettings.mockResolvedValue({ vars: { PickerApiKey: 'key-1' }, isEnabled: true });
    const result = hookFor('cred-1');

    await act(async () => {
      await result.current?.onSelect();
    });

    expect(toastError).toHaveBeenCalledWith('Google Picker configuration is incomplete');
    expect(picker.openPicker).not.toHaveBeenCalled();
  });

  it('asks to reconnect a Credential with no recorded Google account', () => {
    credentialsState.credentials = [credential({}, null)];

    expect(hookFor('cred-1').current).toMatchObject({
      label: '+ Add spreadsheet',
      disabled: true,
      hint: 'Reconnect this Credential to add spreadsheets.',
    });
  });

  it('asks to reconnect a Credential without a connection', () => {
    credentialsState.credentials = [credential({ publicMetadata: { fields: {} } })];

    expect(hookFor('cred-1').current).toMatchObject({
      disabled: true,
      hint: 'Reconnect this Credential to add spreadsheets.',
    });
  });

  it('offers nothing while the Credentials load', () => {
    credentialsState.isPending = true;
    credentialsState.isSuccess = false;

    expect(hookFor('cred-1').current).toBeUndefined();
  });

  it('offers nothing to a member who cannot see the Credential', () => {
    expect(hookFor('cred-1').current).toBeUndefined();
  });

  it('offers nothing to a member who cannot use the Credential', () => {
    credentialsState.credentials = [credential({ canUse: false })];

    expect(hookFor('cred-1').current).toBeUndefined();
  });

  it('asks to reload when the Credentials could not be loaded', () => {
    credentialsState.isSuccess = false;

    expect(hookFor('cred-1').current).toMatchObject({ disabled: true, hint: UNAVAILABLE_HINT });
  });
});
