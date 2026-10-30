import {
  GoogleSheetsLoginButton,
  type GoogleSheetsLoginResponse,
} from '../../../../../../../shared/components/GoogleSheetsLoginButton';
import type { OauthRenderComponentProps } from '../OauthRenderFactory';
import { useGoogleSheetsPicker } from '../../../../../../../../google-oauth';
import { Button } from '@owox/ui/components/button';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';
import { CircleCheck, FileSpreadsheet } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'react-hot-toast';

export function GoogleSheetsOauthRender({
  isLoading,
  status,
  settings,
  onOAuthSuccess,
  configuration,
  onValueChange,
  forCredential = false,
}: OauthRenderComponentProps) {
  const [isPickingSpreadsheet, setIsPickingSpreadsheet] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const { openPicker } = useGoogleSheetsPicker();

  const connectedEmail = status?.user?.email ?? status?.user?.name;
  const spreadsheetUrl =
    typeof configuration.SpreadsheetId === 'string' ? configuration.SpreadsheetId.trim() : '';
  const spreadsheetSelected = spreadsheetUrl !== '';

  const handleGoogleLogin = async (response: GoogleSheetsLoginResponse) => {
    // With drive.file a Credential opens only files its account picked, so its connect picks first.
    const result = await (forCredential
      ? onOAuthSuccess({ code: response.code }, exchanged =>
          pickSpreadsheet(exchanged.user?.email ?? exchanged.user?.name, message => {
            toast.error(message);
          })
        )
      : onOAuthSuccess({ code: response.code }));
    const nextEmail = result?.user?.email ?? result?.user?.name;

    const accountChanged = Boolean(
      result &&
      connectedEmail &&
      nextEmail &&
      nextEmail.toLowerCase() !== connectedEmail.toLowerCase()
    );
    if (accountChanged && spreadsheetSelected) {
      onValueChange('SpreadsheetId', '');
    }
    if (result) {
      setPickerError(null);
      // A Credential's form closes once it is connected and says so itself.
      if (forCredential) return;
      // The popup closes on its own; say out loud that the account is connected and,
      // when no spreadsheet is chosen yet, what comes next, so the user does not have
      // to spot the changed button label.
      const connected = nextEmail
        ? `Google account ${nextEmail} connected.`
        : 'Google account connected.';
      const needsSpreadsheet = accountChanged || !spreadsheetSelected;
      toast.success(needsSpreadsheet ? `${connected} Now choose a spreadsheet.` : connected);
    }
  };

  const clientId = settings?.vars.ClientId as string | undefined;
  const pickerApiKey = settings?.vars.PickerApiKey as string | undefined;
  const projectNumber = settings?.vars.ProjectNumber as string | undefined;
  // Connect passes a toast: its form closes right after, so an inline error would be lost.
  const pickSpreadsheet = async (
    hintEmail: string | undefined,
    report: (message: string) => void = setPickerError
  ) => {
    if (!clientId || !pickerApiKey || !projectNumber) {
      report('Google Picker configuration is incomplete');
      return;
    }
    if (!hintEmail?.includes('@')) {
      report('Reconnect Google Sheets before choosing a spreadsheet');
      return;
    }

    setPickerError(null);
    setIsPickingSpreadsheet(true);
    await openPicker({
      apiKey: pickerApiKey,
      appId: projectNumber,
      clientId,
      hintEmail,
      onPicked: spreadsheet => {
        onValueChange('SpreadsheetId', spreadsheet.url);
      },
      onError: report,
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
            {status.valid && <CircleCheck className='h-4 w-4 text-green-600' aria-hidden='true' />}
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
            onClick={() => {
              void pickSpreadsheet(connectedEmail);
            }}
            disabled={isLoading || isPickingSpreadsheet}
            className='w-full'
          >
            <FileSpreadsheet className='h-4 w-4' />
            {isPickingSpreadsheet
              ? 'Opening Google Picker...'
              : forCredential
                ? 'Add spreadsheet'
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
