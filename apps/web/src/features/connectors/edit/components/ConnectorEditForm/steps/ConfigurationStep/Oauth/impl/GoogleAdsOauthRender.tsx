import { GoogleAdsLoginButton } from '../../../../../../../shared/components/GoogleAdsLoginButton';
import type { GoogleAdsLoginResponse } from '../../../../../../../shared/components/GoogleAdsLoginButton';
import type { OauthRenderComponentProps } from '../OauthRenderFactory';
import { useGoogleDrivePicker } from '../../../../../../../../google-oauth/hooks/useGoogleDrivePicker';
import { Button } from '@owox/ui/components/button';
import { FileSpreadsheet } from 'lucide-react';
import { useState } from 'react';

const GOOGLE_SHEETS_OAUTH_SCOPE =
  'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email';

export function GoogleAdsOauthRender({
  isLoading,
  status,
  settings,
  onOAuthSuccess,
  connectorName,
  configuration,
  onValueChange,
}: OauthRenderComponentProps) {
  const [isPickingSpreadsheet, setIsPickingSpreadsheet] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const { openPicker } = useGoogleDrivePicker();

  const handleGoogleAdsLogin = (response: GoogleAdsLoginResponse) => {
    void onOAuthSuccess({ code: response.code });
  };

  const isGoogleSheets = connectorName === 'GoogleSheets';
  const clientId = settings?.vars.ClientId as string | undefined;
  const pickerApiKey = settings?.vars.PickerApiKey as string | undefined;
  const projectNumber = settings?.vars.ProjectNumber as string | undefined;
  const spreadsheetSelected =
    typeof configuration.SpreadsheetId === 'string' && configuration.SpreadsheetId.trim() !== '';

  const handlePickSpreadsheet = () => {
    if (!clientId || !pickerApiKey || !projectNumber) {
      setPickerError('Google Picker configuration is incomplete');
      return;
    }

    setPickerError(null);
    setIsPickingSpreadsheet(true);
    void openPicker({
      apiKey: pickerApiKey,
      appId: projectNumber,
      clientId,
      selection: 'spreadsheet',
      hintEmail: status?.user?.email ?? status?.user?.name,
      onPicked: spreadsheet => {
        onValueChange('SpreadsheetId', spreadsheet.url);
      },
      onError: setPickerError,
    }).finally(() => {
      setIsPickingSpreadsheet(false);
    });
  };

  return (
    <div className='mt-2 mb-2 space-y-4'>
      <GoogleAdsLoginButton
        clientId={settings?.vars.ClientId as string}
        redirectUri={settings?.vars.RedirectUri as string}
        scope={isGoogleSheets ? GOOGLE_SHEETS_OAUTH_SCOPE : undefined}
        serviceName={isGoogleSheets ? 'Google Sheets' : 'Google Ads'}
        successMessageType={isGoogleSheets ? 'GOOGLE_SHEETS_AUTH_SUCCESS' : undefined}
        errorMessageType={isGoogleSheets ? 'GOOGLE_SHEETS_AUTH_ERROR' : undefined}
        onSuccess={handleGoogleAdsLogin}
        disabled={isLoading}
      >
        {status?.user ? (
          <>
            Connected as <strong>{status.user.name ?? status.user.id}</strong>
          </>
        ) : (
          'Sign in with Google'
        )}
      </GoogleAdsLoginButton>
      {isGoogleSheets && status?.valid && (
        <Button
          type='button'
          variant='outline'
          onClick={handlePickSpreadsheet}
          disabled={isLoading || isPickingSpreadsheet}
          className='w-full'
        >
          <FileSpreadsheet className='h-4 w-4' />
          {isPickingSpreadsheet
            ? 'Opening Google Picker...'
            : spreadsheetSelected
              ? 'Change spreadsheet'
              : 'Choose spreadsheet'}
        </Button>
      )}
      {pickerError && <div className='text-destructive text-sm'>{pickerError}</div>}
    </div>
  );
}
