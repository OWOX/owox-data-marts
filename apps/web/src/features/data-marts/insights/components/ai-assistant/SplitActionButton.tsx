import { ChevronDown } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';

interface SplitActionButtonProps {
  label: string;
  onApply: () => void;
  onApplyOnly: () => void;
  disabled?: boolean;
}

export function SplitActionButton({
  label,
  onApply,
  onApplyOnly,
  disabled,
}: SplitActionButtonProps) {
  return (
    <div className='group bg-background hover:bg-accent flex items-center overflow-hidden rounded-md border transition-colors'>
      <Button
        variant='ghost'
        size='sm'
        className='h-8 rounded-none border-r px-3'
        onClick={onApply}
        disabled={disabled}
        title={label}
        aria-label={label}
      >
        Apply &amp; Run
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant='ghost'
            size='sm'
            className='h-8 w-8 rounded-none px-0'
            disabled={disabled}
            title={`${label} (apply only)`}
            aria-label={`${label} (apply only)`}
          >
            <ChevronDown className='h-4 w-4' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          <DropdownMenuItem onClick={onApplyOnly}>Apply only</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
