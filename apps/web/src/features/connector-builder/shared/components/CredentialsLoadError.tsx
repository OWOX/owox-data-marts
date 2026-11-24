import { Button } from '@owox/ui/components/button';

/** Says the Credentials or what they must hold could not be loaded, with the server's reason and a retry when given. */
export function CredentialsLoadError({
  onRetry,
  reason,
}: {
  onRetry?: () => void;
  reason?: string;
}) {
  return (
    <div role='alert' className='flex items-center gap-3 text-sm'>
      <span className='text-muted-foreground min-w-0 break-words'>
        Could not load Credentials.{reason ? ` ${reason}` : ''}
      </span>
      {onRetry && (
        <Button type='button' variant='outline' size='sm' onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
