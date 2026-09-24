import { useEffect } from 'react';
import { useRouteError, isRouteErrorResponse, Link } from 'react-router';
import { Button } from '@owox/ui/components/button';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { logRouteError } from './logRouteError';
import { hasStaleChunk } from '../../app/stale-chunk';

export function LayoutErrorBoundary() {
  const error = useRouteError();

  useEffect(() => {
    logRouteError(error);
  }, [error]);

  if (isRouteErrorResponse(error) && error.status === 404) {
    return null;
  }

  // A lazy chunk from the previous release is missing: only a reload can help,
  // so say so and lead with it.
  const stale = hasStaleChunk();
  const reload = (
    <Button
      variant={stale ? 'default' : 'outline'}
      onClick={() => {
        window.location.reload();
      }}
    >
      Reload Page
    </Button>
  );
  const home = (
    <Button variant={stale ? 'outline' : 'default'} asChild>
      <Link to={'/'} className='flex items-center gap-1' aria-label='Guide Me Home'>
        Guide Me Home
        <ChevronRight className='h-4 w-4' />
      </Link>
    </Button>
  );

  return (
    <div className='dm-empty-state-404page'>
      <div className='dm-empty-state-404page-foreground'>
        <AlertTriangle className='dm-empty-state-ico' strokeWidth={1} />

        <h1 className='dm-empty-state-title'>
          {stale ? 'A new version is available' : 'Something went wrong'}
        </h1>

        <p className='dm-empty-state-subtitle'>
          {stale ? (
            'The app was updated while this tab was open. Reload the page to continue.'
          ) : (
            <>
              The app hit an unexpected glitch. Don&apos;t worry — your data is safe.
              <br />
              Try navigating to another section or heading home.
            </>
          )}
        </p>

        <div className='flex items-center gap-3'>
          {stale ? reload : home}
          {stale ? home : reload}
        </div>

        {import.meta.env.DEV && error instanceof Error && (
          <details className='mt-8 w-full max-w-2xl'>
            <summary className='text-muted-foreground cursor-pointer text-sm'>
              Error details
            </summary>
            <pre className='text-muted-foreground mt-2 overflow-auto rounded border p-4 text-xs'>
              {error.message}
              {'\n\n'}
              {error.stack}
            </pre>
          </details>
        )}
      </div>

      <div className='dm-empty-state-404page-background' />
    </div>
  );
}
