import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { cn } from '@owox/ui/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@owox/ui/components/tooltip';

interface CopyableFieldProps {
  value: string;
  children?: React.ReactNode;
}

export function CopyableField({ value, children }: CopyableFieldProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            role='button'
            tabIndex={0}
            onClick={handleCopy}
            onKeyDown={e => e.key === 'Enter' && handleCopy()}
            className={cn(
              'flex cursor-pointer items-center justify-between gap-2 select-none',
              'text-muted-foreground border-input rounded-md border px-3 py-1.5 text-sm',
              'hover:bg-accent hover:text-accent-foreground transition-colors'
            )}
          >
            <span className='truncate'>{children || value || 'No data'}</span>
            {copied ? <Check className='h-4 w-4 text-green-500' /> : <Copy className='h-4 w-4' />}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{copied ? 'Copied!' : 'Click to copy'}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
