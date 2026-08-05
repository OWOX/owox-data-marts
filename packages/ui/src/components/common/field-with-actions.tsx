import { useEffect, useRef, useState } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { cn } from '@owox/ui/lib/utils';

type CopyAction = {
  type: 'copy';
  tooltip?: string;
  copiedTooltip?: string;
  onCopyError?: () => void;
};

type ExternalLinkAction = {
  type: 'external-link';
  href: string;
  tooltip?: string;
};

export type FieldWithActionsAction = CopyAction | ExternalLinkAction;

interface FieldWithActionsProps {
  value: string;
  actions: FieldWithActionsAction[];
  className?: string;
}

export function FieldWithActions({ value, actions, className }: FieldWithActionsProps) {
  const [copied, setCopied] = useState(false);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimeoutRef.current) {
        clearTimeout(resetTimeoutRef.current);
      }
    };
  }, []);

  const handleCopy = async (onCopyError?: () => void) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);

      if (resetTimeoutRef.current) {
        clearTimeout(resetTimeoutRef.current);
      }

      resetTimeoutRef.current = setTimeout(() => {
        setCopied(false);
        resetTimeoutRef.current = null;
      }, 2000);
    } catch {
      onCopyError?.();
    }
  };

  return (
    <div
      className={cn(
        'text-foreground flex w-full items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-normal',
        className
      )}
    >
      <span className='min-w-0 flex-1 truncate select-text'>{value}</span>
      <div className='flex shrink-0 items-center gap-1'>
        {actions.map((action, index) => {
          if (action.type === 'copy') {
            const tooltip = copied
              ? (action.copiedTooltip ?? 'Copied!')
              : (action.tooltip ?? 'Copy');

            return (
              <Tooltip key={`copy-${index}`}>
                <TooltipTrigger asChild>
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon-sm'
                    className='size-6'
                    onClick={() => void handleCopy(action.onCopyError)}
                    aria-label={tooltip}
                  >
                    {copied ? (
                      <Check className='h-3 w-3' strokeWidth={1.5} aria-hidden='true' />
                    ) : (
                      <Copy className='h-3 w-3' strokeWidth={1.5} aria-hidden='true' />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{tooltip}</p>
                </TooltipContent>
              </Tooltip>
            );
          }

          const tooltip = action.tooltip ?? 'Open link';

          return (
            <Tooltip key={`external-link-${index}`}>
              <TooltipTrigger asChild>
                <Button
                  asChild
                  variant='ghost'
                  size='icon-sm'
                  className='size-6'
                  aria-label={tooltip}
                >
                  <a href={action.href} target='_blank' rel='noopener noreferrer'>
                    <ExternalLink className='h-3 w-3' strokeWidth={1.5} aria-hidden='true' />
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{tooltip}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
