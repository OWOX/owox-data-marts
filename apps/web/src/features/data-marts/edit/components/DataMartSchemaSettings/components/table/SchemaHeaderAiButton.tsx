import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '@owox/ui/components/button';

interface SchemaHeaderAiButtonProps {
  tooltip: string;
  ariaLabel: string;
  disabled: boolean;
  isLoading: boolean;
  onClick: () => void;
}

export function SchemaHeaderAiButton({
  tooltip,
  ariaLabel,
  disabled,
  isLoading,
  onClick,
}: SchemaHeaderAiButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type='button'
          variant='ghost'
          size='icon-sm'
          disabled={disabled}
          onClick={onClick}
          aria-label={ariaLabel}
        >
          {isLoading ? (
            <Loader2 className='h-3.5 w-3.5 animate-spin' />
          ) : (
            <Sparkles className='h-3.5 w-3.5' />
          )}
        </Button>
      </TooltipTrigger>

      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
