import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { cn } from '@owox/ui/lib/utils';

interface OutputSettingsButtonProps {
  active: boolean;
  open: boolean;
  onClick: () => void;
}

export function OutputSettingsButton({ active, open, onClick }: OutputSettingsButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type='button'
          variant={open ? 'secondary' : 'ghost'}
          size='sm'
          aria-label='Output controls'
          aria-expanded={open}
          onClick={onClick}
          className='h-6 w-6 p-0'
        >
          <SlidersHorizontal className={cn('h-3.5 w-3.5', active && 'text-blue-500')} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Output controls</TooltipContent>
    </Tooltip>
  );
}
