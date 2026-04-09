import { useEffect } from 'react';
import { useRouteError, isRouteErrorResponse, Link } from 'react-router-dom';
import { Button } from '@owox/ui/components/button';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { logRouteError } from './logRouteError';

export function LayoutErrorBoundary() {
  const error = useRouteError();

  useEffect(() => {
    logRouteError(error);
  }, [error]);

  if (isRouteErrorResponse(error) && error.status === 404) {
    return null;
  }

  return (
    <div className='dm-empty-state-404page'>
      <div className='dm-empty-state-404page-foreground'>
        <AlertTriangle className='dm-empty-state-ico' strokeWidth={1} />

        <h1 className='dm-empty-state-title'>Something went wrong</h1>

        <p className='dm-empty-state-subtitle'>
          The app hit an unexpected glitch. Don&apos;t worry — your data is safe.
          <br />
          Try navigating to another section or heading home.
        </p>

        <div className='flex items-center gap-3'>
          <Button variant='default' asChild>
            <Link to={'/'} className='flex items-center gap-1' aria-label='Guide Me Home'>
              Guide Me Home
              <ChevronRight className='h-4 w-4' />
            </Link>
          </Button>
          <Button
            variant='outline'
            onClick={() => {
              window.location.reload();
            }}
          >
            Reload Page
          </Button>
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
