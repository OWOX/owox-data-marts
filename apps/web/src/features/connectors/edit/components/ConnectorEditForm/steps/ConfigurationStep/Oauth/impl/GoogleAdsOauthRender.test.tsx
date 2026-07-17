import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpenGoogleDrivePickerOptions } from '../../../../../../../../google-oauth/hooks/useGoogleDrivePicker';
import type { OauthRenderComponentProps } from '../OauthRenderFactory';
import { GoogleAdsOauthRender } from './GoogleAdsOauthRender';

const { openPicker } = vi.hoisted(() => ({
  openPicker: vi.fn<(options: OpenGoogleDrivePickerOptions) => Promise<void>>(),
}));

vi.mock('../../../../../../../../google-oauth/hooks/useGoogleDrivePicker', () => ({
  useGoogleDrivePicker: () => ({ openPicker }),
}));

vi.mock('../../../../../../../shared/components/GoogleAdsLoginButton', () => ({
  GoogleAdsLoginButton: ({ scope, children }: { scope?: string; children?: ReactNode }) => (
    <div data-testid='google-login' data-scope={scope}>
      {children}
    </div>
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

  render(<GoogleAdsOauthRender {...props} />);
  return props;
}

describe('GoogleAdsOauthRender for Google Sheets', () => {
  beforeEach(() => {
    openPicker.mockReset();
  });

  it('requests drive.file and stores the spreadsheet selected with Google Picker', async () => {
    openPicker.mockImplementation(async options => {
      options.onPicked({
        id: 'sheet-1',
        name: 'Goals',
        url: 'https://docs.google.com/spreadsheets/d/sheet-1/edit',
      });
    });
    const props = renderGoogleSheetsOAuth();

    expect(screen.getByTestId('google-login')).toHaveAttribute(
      'data-scope',
      'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email'
    );

    fireEvent.click(screen.getByRole('button', { name: 'Choose spreadsheet' }));

    await waitFor(() => {
      expect(openPicker).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: 'picker-key',
          appId: '123456789',
          clientId: 'client-id',
          selection: 'spreadsheet',
          hintEmail: 'analyst@example.com',
        })
      );
      expect(props.onValueChange).toHaveBeenCalledWith(
        'SpreadsheetId',
        'https://docs.google.com/spreadsheets/d/sheet-1/edit'
      );
    });
  });
});
