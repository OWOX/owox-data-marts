import { CheckCircle2 } from 'lucide-react';

/**
 * A dedicated, static route for the post-creation confirmation — not just a state inside
 * ConnectGoogleSheetsPage. Navigated to (via `navigate(..., { replace: true })`) right after
 * the destination is created, so a page refresh (or the browser restoring this tab later)
 * lands back here instead of the connect form, which would otherwise risk creating a
 * duplicate destination if "Connect with Google" were triggered again.
 *
 * Deliberately generic, with no destination title or other data taken from the URL: a query
 * param can't be trusted to reflect what was actually created (or that anything was created
 * at all), so nothing here should be treated as an authoritative confirmation of details.
 */
export function ConnectGoogleSheetsDonePage() {
  return (
    <div className='bg-card text-card-foreground w-full max-w-lg rounded-lg p-6 text-center shadow-lg'>
      <div className='mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30'>
        <CheckCircle2 className='h-7 w-7 text-green-600 dark:text-green-400' aria-hidden='true' />
      </div>
      <p className='text-sm'>Your Google Sheets destination was created successfully.</p>
      <p className='text-muted-foreground mt-1 text-sm'>
        You can close this tab now and return to your conversation to continue.
      </p>
    </div>
  );
}
