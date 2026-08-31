import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpenGoogleSheetsPickerOptions } from '../../../../../../../../google-oauth';
import type { OauthRenderComponentProps } from '../OauthRenderFactory';
import { GoogleSheetsOauthRender } from './GoogleSheetsOauthRender';

const { openPicker } = vi.hoisted(() => ({
  openPicker: vi.fn<(options: OpenGoogleSheetsPickerOptions) => Promise<void>>(),
}));

vi.mock('../../../../../../../../google-oauth', () => ({
  useGoogleSheetsPicker: () => ({ openPicker }),
}));

vi.mock('../../../../../../../shared/components/GoogleSheetsLoginButton', () => ({
  GoogleSheetsLoginButton: ({
    children,
    onSuccess,
  }: {
    children?: React.ReactNode;
    onSuccess: (response: { code: string }) => void;
  }) => (
    <button
      type='button'
      data-testid='google-login'
      onClick={() => {
        onSuccess({ code: 'code' });
      }}
    >
      {children}
    </button>
  ),
}));

function renderGoogleSheetsOAuth(overrides: Partial<OauthRenderComponentProps> = {}) {
  const props = {
    specification: { name: 'AuthType' },
    configuration: {},
    onValueChange: vi.fn(),
    connectorName: 'GoogleSheets',
    isLoading: false,
    status: {
      valid: true,
      user: { id: 'user-1', name: 'analyst@example.com', email: 'analyst@example.com' },
    },
    settings: {
      isEnabled: true,
      vars: {
        ClientId: 'client-id',
        RedirectUri: 'https://app.example.com/oauth/google-sheets/callback',
        PickerApiKey: 'picker-key',
        ProjectNumber: '123456789',
      },
    },
    onOAuthSuccess: vi.fn().mockResolvedValue({
      success: true,
      credentialId: 'credential-1',
      user: { id: 'user-1', name: 'analyst@example.com', email: 'analyst@example.com' },
      additional: {},
    }),
    ...overrides,
  } as OauthRenderComponentProps;

  render(<GoogleSheetsOauthRender {...props} />);
  return props;
}

describe('GoogleSheetsOauthRender', () => {
  beforeEach(() => {
    openPicker.mockReset();
  });

  it('stores the spreadsheet selected with Google Picker', async () => {
    openPicker.mockImplementation(async options => {
      options.onPicked({
        id: 'sheet-1',
        name: 'Goals',
        url: 'https://docs.google.com/spreadsheets/d/sheet-1/edit',
      });
    });
    const props = renderGoogleSheetsOAuth();

    fireEvent.click(screen.getByRole('button', { name: 'Choose spreadsheet' }));

    await waitFor(() => {
      expect(openPicker).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: 'picker-key',
          appId: '123456789',
          clientId: 'client-id',
          hintEmail: 'analyst@example.com',
        })
      );
      expect(props.onValueChange).toHaveBeenCalledWith(
        'SpreadsheetId',
        'https://docs.google.com/spreadsheets/d/sheet-1/edit'
      );
    });
  });

  it('announces an incomplete Picker configuration', () => {
    renderGoogleSheetsOAuth({
      settings: {
        isEnabled: true,
        vars: {
          ClientId: 'client-id',
          RedirectUri: 'https://app.example.com/oauth/google-sheets/callback',
        },
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Choose spreadsheet' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Google Picker configuration is incomplete'
    );
  });

  it('shows the Picker-selected spreadsheet as a read-only link', () => {
    const spreadsheetUrl = 'https://docs.google.com/spreadsheets/d/sheet-1/edit';

    renderGoogleSheetsOAuth({
      configuration: { SpreadsheetId: spreadsheetUrl },
    });

    expect(screen.getByRole('button', { name: 'Change spreadsheet' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: spreadsheetUrl })).toHaveAttribute(
      'href',
      spreadsheetUrl
    );
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('clears the selected spreadsheet after connecting another account', async () => {
    const props = renderGoogleSheetsOAuth({
      configuration: {
        SpreadsheetId: 'https://docs.google.com/spreadsheets/d/old-sheet/edit',
      },
      onOAuthSuccess: vi.fn().mockResolvedValue({
        success: true,
        credentialId: 'credential-2',
        user: { id: 'user-2', name: 'other@example.com', email: 'other@example.com' },
        additional: {},
      }),
    });

    fireEvent.click(screen.getByTestId('google-login'));

    await waitFor(() => {
      expect(props.onOAuthSuccess).toHaveBeenCalledWith({ code: 'code' });
      expect(props.onValueChange).toHaveBeenCalledWith('SpreadsheetId', '');
    });
  });

  it('keeps the selected spreadsheet after reconnecting the same account', async () => {
    const props = renderGoogleSheetsOAuth({
      configuration: {
        SpreadsheetId: 'https://docs.google.com/spreadsheets/d/old-sheet/edit',
      },
    });

    fireEvent.click(screen.getByTestId('google-login'));

    await waitFor(() => {
      expect(props.onOAuthSuccess).toHaveBeenCalledWith({ code: 'code' });
    });
    expect(props.onValueChange).not.toHaveBeenCalledWith('SpreadsheetId', '');
  });

  it('keeps the selected spreadsheet when reconnection fails', async () => {
    const props = renderGoogleSheetsOAuth({
      configuration: {
        SpreadsheetId: 'https://docs.google.com/spreadsheets/d/old-sheet/edit',
      },
      onOAuthSuccess: vi.fn().mockResolvedValue(null),
    });

    fireEvent.click(screen.getByTestId('google-login'));

    await waitFor(() => {
      expect(props.onOAuthSuccess).toHaveBeenCalledWith({ code: 'code' });
    });
    expect(props.onValueChange).not.toHaveBeenCalledWith('SpreadsheetId', '');
  });

  it('keeps the selected spreadsheet when the previous account identity is unavailable', async () => {
    const props = renderGoogleSheetsOAuth({
      configuration: {
        SpreadsheetId: 'https://docs.google.com/spreadsheets/d/old-sheet/edit',
      },
      status: { valid: false },
    });

    fireEvent.click(screen.getByTestId('google-login'));

    await waitFor(() => {
      expect(props.onOAuthSuccess).toHaveBeenCalledWith({ code: 'code' });
    });
    expect(props.onValueChange).not.toHaveBeenCalledWith('SpreadsheetId', '');
  });
});
