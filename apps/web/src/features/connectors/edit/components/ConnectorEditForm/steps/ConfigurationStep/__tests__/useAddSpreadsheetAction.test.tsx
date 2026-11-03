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

const oauth = vi.hoisted(() => ({ getSettings: vi.fn(), getPickerToken: vi.fn() }));
vi.mock('../../../../../../shared/model/hooks/useOAuth', () => ({
  useOAuth: () => oauth,
}));

const picker = vi.hoisted(() => ({ openPicker: vi.fn() }));
vi.mock('../../../../../../../google-oauth', () => ({
  useGoogleSheetsPicker: () => picker,
}));

const toastError = vi.hoisted(() => vi.fn());
vi.mock('react-hot-toast', () => ({ toast: { error: toastError } }));

const OTHER_SIGNER_HINT =
  'Spreadsheets are added by the person who connected a@example.com. Connect your own Google account to add one.';
const UNAVAILABLE_HINT = 'Spreadsheets cannot be added right now. Reload the page and try again.';
const UNKNOWN_SIGNER_HINT =
  'Spreadsheets are added by the person who connected this Google account. Connect your own Google account to add one.';

function credential(filePicking: string | null | undefined) {
  return {
    id: 'cred-1',
    filePicking,
    publicMetadata: {
      fields: {},
      connection: {
        account: { id: 'g-1', name: 'A', email: 'a@example.com' },
        expiresAt: null,
        signedInByUserId: 'user-1',
      },
    },
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

  it("opens Picker for the signer with the backend token and the account's email", async () => {
    credentialsState.credentials = [credential('allowed')];
    oauth.getSettings.mockResolvedValue({
      vars: { PickerApiKey: 'key-1', ProjectNumber: '123', ClientId: 'client-1' },
      isEnabled: true,
    });
    oauth.getPickerToken.mockResolvedValue('token-1');
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
        hintEmail: 'a@example.com',
        accessToken: expect.any(Function),
      })
    );
    const options = picker.openPicker.mock.calls[0][0] as OpenGoogleSheetsPickerOptions;
    expect(options.clientId).toBeUndefined();
    await expect((options.accessToken as () => Promise<string>)()).resolves.toBe('token-1');
    expect(oauth.getPickerToken).toHaveBeenCalledWith('GoogleSheets', 'cred-1');
    expect(onPicked).toHaveBeenCalledWith('https://docs.google.com/x', 'Budget');
  });

  it('reports a Picker error with a toast', async () => {
    credentialsState.credentials = [credential('allowed')];
    oauth.getSettings.mockResolvedValue({
      vars: { PickerApiKey: 'key-1', ProjectNumber: '123' },
      isEnabled: true,
    });
    picker.openPicker.mockImplementation(async (options: OpenGoogleSheetsPickerOptions) => {
      options.onError?.('Picker failed');
    });
    const result = hookFor('cred-1');

    await act(async () => {
      await result.current?.onSelect();
    });

    expect(toastError).toHaveBeenCalledWith('Picker failed');
  });

  it('names the signer for another member', () => {
    credentialsState.credentials = [credential('other-signer')];

    expect(hookFor('cred-1').current).toMatchObject({
      label: '+ Add spreadsheet',
      disabled: true,
      hint: OTHER_SIGNER_HINT,
    });
  });

  it('asks to reconnect an unrecorded Credential the member can edit', () => {
    credentialsState.credentials = [credential('reconnect')];

    expect(hookFor('cred-1').current).toMatchObject({
      disabled: true,
      hint: 'Reconnect this Credential to add spreadsheets.',
    });
  });

  it('names no email for an unrecorded Credential the member cannot edit', () => {
    credentialsState.credentials = [credential('not-recorded')];
    expect(hookFor('cred-1').current).toMatchObject({ disabled: true, hint: UNKNOWN_SIGNER_HINT });
  });

  it('asks for edit access when the signer can no longer edit the Credential', () => {
    credentialsState.credentials = [credential('signer-without-edit')];

    expect(hookFor('cred-1').current).toMatchObject({
      disabled: true,
      hint: 'You need edit access to this Credential to add spreadsheets.',
    });
  });

  it('offers nothing while the Credentials load', () => {
    credentialsState.isPending = true;
    credentialsState.isSuccess = false;

    expect(hookFor('cred-1').current).toBeUndefined();
  });

  it('points a member who cannot see the Credential to its signer', () => {
    expect(hookFor('cred-1').current).toMatchObject({ disabled: true, hint: UNKNOWN_SIGNER_HINT });
  });

  it('asks to reload when the Credentials could not be loaded', () => {
    credentialsState.isSuccess = false;

    expect(hookFor('cred-1').current).toMatchObject({ disabled: true, hint: UNAVAILABLE_HINT });
  });

  it('asks to reload when the backend does not say whether Picker opens', () => {
    credentialsState.credentials = [credential(undefined)];

    expect(hookFor('cred-1').current).toMatchObject({ disabled: true, hint: UNAVAILABLE_HINT });
  });

  it('offers nothing for a Credential that opens no Picker', () => {
    credentialsState.credentials = [credential(null)];

    expect(hookFor('cred-1').current).toBeUndefined();
  });
});
