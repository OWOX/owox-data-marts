import { Button } from '@owox/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { cn } from '@owox/ui/lib/utils';
import { Loader2, Sparkles } from 'lucide-react';

interface AiHelperButtonProps {
  /** Triggered when the button is clicked. Component handles loading state for the caller. */
  onClick: () => void;
  /** Whether a generation is currently in-flight. */
  isLoading?: boolean;
  /** Whether the button is disabled for reasons other than loading (e.g. nothing to operate on). */
  disabled?: boolean;
  /** Tooltip shown on hover. */
  tooltip: string;
  /** Optional aria-label override. Falls back to `tooltip`. */
  ariaLabel?: string;
  /** Optional extra classes. */
  className?: string;
}

/**
 * Compact icon button for triggering AI metadata generation.
 * Shows a spinner while generating, otherwise a Sparkles icon.
 */
export function AiHelperButton({
  onClick,
  isLoading = false,
  disabled = false,
  tooltip,
  ariaLabel,
  className,
}: AiHelperButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type='button'
          variant='ghost'
          size='icon'
          onClick={onClick}
          disabled={disabled || isLoading}
          aria-label={ariaLabel ?? tooltip}
          className={cn('h-8 w-8 shrink-0', className)}
        >
          {isLoading ? (
            <Loader2 className='h-4 w-4 animate-spin' aria-hidden='true' />
          ) : (
            <Sparkles className='h-4 w-4' aria-hidden='true' />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side='bottom'>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
