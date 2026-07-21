import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpenGoogleSheetsPickerOptions } from '../../../../../../../../google-oauth/hooks/useGoogleDrivePicker';
import type { OauthRenderComponentProps } from '../OauthRenderFactory';
import { GoogleSheetsOauthRender } from './GoogleSheetsOauthRender';

const { openPicker } = vi.hoisted(() => ({
  openPicker: vi.fn<(options: OpenGoogleSheetsPickerOptions) => Promise<void>>(),
}));

vi.mock('../../../../../../../../google-oauth/hooks/useGoogleDrivePicker', () => ({
  useGoogleSheetsPicker: () => ({ openPicker }),
}));

vi.mock('../../../../../../../shared/components/GoogleSheetsLoginButton', () => ({
  GoogleSheetsLoginButton: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid='google-login'>{children}</div>
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
      user: { id: 'user-1', email: 'analyst@example.com' },
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
    onOAuthSuccess: vi.fn().mockResolvedValue(undefined),
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
});
