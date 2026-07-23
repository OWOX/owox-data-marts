import { Button } from '@owox/ui/components/button';
import { cn } from '@owox/ui/lib/utils';
import { Loader2 } from 'lucide-react';

interface RunActivityIndicatorProps {
  active: boolean;
  label: string;
  onViewRuns: () => void;
  separator?: boolean;
  className?: string;
}

export function RunActivityIndicator({
  active,
  label,
  onViewRuns,
  separator = false,
  className,
}: RunActivityIndicatorProps) {
  if (!active) return null;

  return (
    <div
      className={cn(
        'flex shrink-0 items-center gap-2',
        separator && 'border-border border-r pr-4',
        className
      )}
    >
      <div
        role='status'
        aria-live='polite'
        className='text-muted-foreground flex items-center gap-1 text-sm whitespace-nowrap'
      >
        <Loader2 className='h-4 w-4 animate-spin' aria-hidden='true' />
        <span>{label}</span>
      </div>

      <Button variant='outline' size='sm' onClick={onViewRuns}>
        View runs
      </Button>
    </div>
  );
}
