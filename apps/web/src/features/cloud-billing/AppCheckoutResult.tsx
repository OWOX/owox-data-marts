import { Link, useSearchParams } from 'react-router';
import { Alert, AlertDescription, AlertTitle } from '@owox/ui/components/alert';
import { Button } from '@owox/ui/components/button';
import { useProjectRoute } from '../../shared/hooks';
import type { CheckoutSession } from './app-pricing';
import { BillingLoadState } from './BillingLoadState';
import { useCloudBillingQuery } from './cloud-billing';

export function AppCheckoutResult({ origin }: { origin: string }) {
  const project = useProjectRoute();
  const [params] = useSearchParams();
  const sessionId = params.get('session_id') ?? '';
  const validSession = /^cs_(test|live)_[a-zA-Z0-9]+$/.test(sessionId);
  const result = useCloudBillingQuery<CheckoutSession>(
    origin,
    `/api/stripe/app-checkout-sessions/${encodeURIComponent(sessionId)}`,
    undefined,
    validSession
  );
  const session = result.data;
  const paid =
    session?.status === 'complete' &&
    (session.paymentStatus === 'paid' || session.paymentStatus === 'no_payment_required');

  return (
    <div className='dm-page'>
      <header className='dm-page-header'>
        <h1 className='dm-page-header-title'>Checkout result</h1>
      </header>
      <div className='dm-page-content space-y-4'>
        {!validSession ? (
          <Alert variant='destructive'>
            <AlertTitle>Checkout session is missing or invalid</AlertTitle>
          </Alert>
        ) : !result.isSuccess ? (
          <BillingLoadState
            isPending={result.isPending}
            errorTitle='Could not load checkout status'
            onRetry={() => void result.refetch()}
          />
        ) : paid ? (
          <Alert>
            <AlertTitle>Checkout completed</AlertTitle>
            <AlertDescription>Your subscription may take a moment to update.</AlertDescription>
          </Alert>
        ) : session?.status === 'expired' ? (
          <Alert>
            <AlertTitle>Checkout expired</AlertTitle>
            <AlertDescription>Return to pricing to start a new checkout.</AlertDescription>
          </Alert>
        ) : (
          <Alert>
            <AlertTitle>Payment is not confirmed yet</AlertTitle>
            <AlertDescription>
              <Button
                variant='outline'
                size='sm'
                onClick={() => void result.refetch()}
                disabled={result.isFetching}
              >
                Check again
              </Button>
            </AlertDescription>
          </Alert>
        )}
        <Button variant='outline' asChild>
          <Link to={project.scope(paid ? '/project-settings/subscription' : '/pricing')}>
            {paid ? 'View subscription' : 'Back to pricing'}
          </Link>
        </Button>
      </div>
    </div>
  );
}
