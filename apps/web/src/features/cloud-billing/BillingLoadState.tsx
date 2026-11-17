import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@owox/ui/components/alert';
import { Button } from '@owox/ui/components/button';
import { Skeleton } from '@owox/ui/components/skeleton';

interface BillingLoadStateProps {
  isPending: boolean;
  errorTitle: string;
  onRetry: () => void;
}

export function BillingLoadState({ isPending, errorTitle, onRetry }: BillingLoadStateProps) {
  if (isPending) return <Skeleton className='h-20 w-full' aria-label='Loading' />;

  return (
    <Alert variant='destructive'>
      <AlertCircle className='h-4 w-4' />
      <AlertTitle>{errorTitle}</AlertTitle>
      <AlertDescription>
        <Button variant='outline' size='sm' onClick={onRetry}>
          Retry
        </Button>
      </AlertDescription>
    </Alert>
  );
}
