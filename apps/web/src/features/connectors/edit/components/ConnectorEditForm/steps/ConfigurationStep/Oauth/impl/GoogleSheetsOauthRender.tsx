import {
  GoogleSheetsLoginButton,
  type GoogleSheetsLoginResponse,
} from '../../../../../../../shared/components/GoogleSheetsLoginButton';
import type { OauthRenderComponentProps } from '../OauthRenderFactory';
import { useGoogleSheetsPicker } from '../../../../../../../../google-oauth';
import { Button } from '@owox/ui/components/button';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';
import { FileSpreadsheet } from 'lucide-react';
import { useState } from 'react';

export function GoogleSheetsOauthRender({
  isLoading,
  status,
  settings,
  onOAuthSuccess,
  configuration,
  onValueChange,
}: OauthRenderComponentProps) {
  const [isPickingSpreadsheet, setIsPickingSpreadsheet] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const { openPicker } = useGoogleSheetsPicker();

  const connectedEmail = status?.user?.email ?? status?.user?.name;

  const handleGoogleLogin = async (response: GoogleSheetsLoginResponse) => {
    const result = await onOAuthSuccess({ code: response.code });
    const nextEmail = result?.user.email ?? result?.user.name;

    if (
      result &&
      connectedEmail &&
      nextEmail &&
      nextEmail.toLowerCase() !== connectedEmail.toLowerCase() &&
      configuration.SpreadsheetId
    ) {
      onValueChange('SpreadsheetId', '');
    }
    if (result) {
      setPickerError(null);
    }
  };

  const clientId = settings?.vars.ClientId as string | undefined;
  const pickerApiKey = settings?.vars.PickerApiKey as string | undefined;
  const projectNumber = settings?.vars.ProjectNumber as string | undefined;
  const spreadsheetUrl =
    typeof configuration.SpreadsheetId === 'string' ? configuration.SpreadsheetId.trim() : '';
  const spreadsheetSelected = spreadsheetUrl !== '';
  const handlePickSpreadsheet = () => {
    if (!clientId || !pickerApiKey || !projectNumber) {
      setPickerError('Google Picker configuration is incomplete');
      return;
    }
    if (!connectedEmail?.includes('@')) {
      setPickerError('Reconnect Google Sheets before choosing a spreadsheet');
      return;
    }

    setPickerError(null);
    setIsPickingSpreadsheet(true);
    void openPicker({
      apiKey: pickerApiKey,
      appId: projectNumber,
      clientId,
      hintEmail: connectedEmail,
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
      <GoogleSheetsLoginButton
        clientId={settings?.vars.ClientId as string}
        redirectUri={settings?.vars.RedirectUri as string}
        onSuccess={response => void handleGoogleLogin(response)}
        disabled={isLoading}
      >
        {status?.user ? (
          <>
            Connected as <strong>{status.user.name ?? status.user.id}</strong>
          </>
        ) : (
          'Sign in with Google'
        )}
      </GoogleSheetsLoginButton>
      {status?.valid && (
        <div className='space-y-2'>
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
          {spreadsheetSelected && (
            <ExternalAnchor href={spreadsheetUrl} variant='field'>
              {spreadsheetUrl}
            </ExternalAnchor>
          )}
        </div>
      )}
      {pickerError && (
        <div role='alert' className='text-destructive text-sm'>
          {pickerError}
        </div>
      )}
    </div>
  );
}
