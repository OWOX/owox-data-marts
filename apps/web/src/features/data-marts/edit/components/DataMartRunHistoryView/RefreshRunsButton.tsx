import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import { cn } from '@owox/ui/lib/utils';

interface RefreshRunsButtonProps {
  onRefresh: () => Promise<unknown>;
}

/** Loads the newest runs on demand; the list keeps the runs and the open run it already shows. */
export function RefreshRunsButton({ onRefresh }: RefreshRunsButtonProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleClick = async () => {
    setIsRefreshing(true);
    try {
      await onRefresh();
    } catch {
      // The API client toasts HTTP errors.
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <Button
      type='button'
      variant='outline'
      size='sm'
      onClick={() => void handleClick()}
      disabled={isRefreshing}
    >
      <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} aria-hidden='true' />
      <span>Refresh</span>
    </Button>
  );
}
