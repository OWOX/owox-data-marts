import { Button } from '@owox/ui/components/button';
import { cn } from '@owox/ui/lib/utils';

/** Says the Credentials or what they must hold could not be loaded, with the server's reason and a retry when given. */
export function CredentialsLoadError({
  onRetry,
  reason,
}: {
  onRetry?: () => void;
  reason?: string;
}) {
  return (
    <div
      role='alert'
      className={cn(
        'flex items-center gap-3 text-sm',
        reason && 'bg-warning-bg items-start rounded-md px-3 py-2'
      )}
    >
      <div className='min-w-0 break-words'>
        <p className={reason ? 'text-warning font-medium' : 'text-muted-foreground'}>
          Could not load Credentials.
        </p>
        {reason && <p className='text-muted-foreground'>{reason}</p>}
      </div>
      {onRetry && (
        <Button type='button' variant='outline' size='sm' onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
