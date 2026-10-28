import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Loader2 } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import { Input } from '@owox/ui/components/input';
import { Form, FormControl, FormItem, FormLabel, FormLayout } from '@owox/ui/components/form';
import { apiErrorMessage } from '../../app/api';
import { useProjectRoute } from '../../shared/hooks';
import {
  GoogleOAuthCredentialConnect,
  trackCredentialCreated,
  useGoogleOAuthAvailable,
  type Credential,
} from '../../features/credentials';
import { DataDestinationType, dataDestinationService } from '../../features/data-destination';

const DEFAULT_TITLE = 'Google Sheets';
// Not shared: only its owner uses the Credential until they share it.
const CREDENTIAL_DRAFT = { title: '', availableForUse: false, availableForMaintenance: false };

interface ConnectGoogleSheetsFormValues {
  title: string;
}

export function ConnectGoogleSheetsPage() {
  const { navigate } = useProjectRoute();
  // The Title field is never pre-filled from the URL — a query param isn't proof of what
  // the user actually wants, so the user always sets the name directly in this form.
  const form = useForm<ConnectGoogleSheetsFormValues>({
    defaultValues: { title: DEFAULT_TITLE },
  });

  const oauthAvailable = useGoogleOAuthAvailable('destination');
  // Kept after a failed save for Retry; connecting again reconnects it rather than adding another.
  const [credential, setCredential] = useState<Credential | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Guards handleSave itself (not just the UI overlay) against a second onConnected firing
  // while a save is already in flight — the overlay's `pointer-events-none` blocks normal
  // clicks, but this is the actual correctness guarantee against a duplicate create call.
  const savingRef = useRef(false);

  // Fires once per completed OAuth grant and on Retry.
  const handleSave = async (connected: Credential) => {
    setCredential(connected);
    if (savingRef.current) return;

    let currentTitle = form.getValues('title').trim();
    if (!currentTitle) {
      setSaveError('Title is required.');
      return;
    }
    savingRef.current = true;
    setIsSaving(true);
    setSaveError(null);

    // Only the untouched default name gets the connected account appended — a title the
    // user typed by hand is used as-is.
    if (currentTitle === DEFAULT_TITLE && connected.identity) {
      currentTitle = `${currentTitle} (${connected.identity})`;
    }

    try {
      await dataDestinationService.createConnectGoogleSheetsDestination({
        title: currentTitle,
        reusableCredentialId: connected.id,
      });
    } catch (error) {
      console.error('Failed to create the Google Sheets destination', error);
      setSaveError(apiErrorMessage(error, 'Failed to create the destination. Please try again.'));
      setIsSaving(false);
      savingRef.current = false;
      return;
    }

    // The destination now exists — try to close the tab. Browsers silently no-op this for
    // tabs not opened via script, so fall through by navigating to the dedicated confirmation
    // route (not just a local state) — a refresh then lands back on that plain screen instead
    // of this form, which would otherwise risk creating a duplicate destination. No details
    // (like the title) are passed along — an untrusted query param isn't proof of what was
    // actually created, so the confirmation stays deliberately generic.
    window.close();
    navigate('/connect/google-sheets/done', { replace: true });
  };

  if (oauthAvailable === false) {
    return (
      <div className='bg-card text-card-foreground w-full max-w-lg space-y-4 rounded-lg p-4 shadow-lg'>
        <h1 className='text-lg font-semibold'>Connect Google Sheets</h1>
        <p className='text-muted-foreground text-sm'>
          Google OAuth isn&apos;t configured for this OWOX instance, so this quick-connect page
          can&apos;t be used. Ask your admin to configure Google OAuth, or create a Google Sheets
          destination manually from the OWOX web app (Destinations → Add destination) and select a
          Google Service Account Credential instead.
        </p>
      </div>
    );
  }

  return (
    <div className='bg-card text-card-foreground relative w-full max-w-lg overflow-hidden rounded-lg shadow-lg'>
      <Form {...form}>
        <div className={isSaving ? 'pointer-events-none blur-sm' : undefined}>
          <div className='px-4 pt-4'>
            <h1 className='text-lg font-semibold'>Connect Google Sheets</h1>
            <p className='text-muted-foreground mt-1 text-sm'>
              Grant access to your Google account to create this destination.
            </p>
          </div>

          <FormLayout variant='light' className='px-4 py-4'>
            <FormItem>
              <FormLabel tooltip='Name the destination to clarify its purpose'>Title</FormLabel>
              <FormControl>
                <Input
                  placeholder={DEFAULT_TITLE}
                  disabled={isSaving}
                  {...form.register('title')}
                />
              </FormControl>
            </FormItem>

            <GoogleOAuthCredentialConnect
              credential={credential}
              definitionId='google-sheets-oauth'
              client='destination'
              draft={CREDENTIAL_DRAFT}
              onConnected={connected => {
                if (connected.id !== credential?.id) {
                  trackCredentialCreated(
                    'destination',
                    DataDestinationType.GOOGLE_SHEETS,
                    connected
                  );
                }
                void handleSave(connected);
              }}
              variant='quick-connect'
            />

            {saveError && <p className='text-destructive text-sm'>{saveError}</p>}
            {/* The connected Credential stays, so a retry needs no second Google consent. */}
            {saveError && credential && (
              <Button type='button' onClick={() => void handleSave(credential)}>
                Retry
              </Button>
            )}
          </FormLayout>
        </div>
      </Form>

      {isSaving && (
        <div
          data-testid='saving-overlay'
          className='bg-card/60 absolute inset-0 flex items-center justify-center'
        >
          <p className='text-muted-foreground flex items-center gap-2 text-sm font-medium'>
            <Loader2 className='h-4 w-4 animate-spin' />
            Creating your Google Sheets destination…
          </p>
        </div>
      )}
    </div>
  );
}
