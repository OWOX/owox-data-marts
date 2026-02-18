import { Label } from '@owox/ui/components/label';
import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';

export function FieldItem({ children }: { children: React.ReactNode }) {
  return (
    <div className='group border-border flex flex-col gap-2 rounded-md border-b bg-white px-4 py-3 transition-shadow duration-200 hover:shadow-sm dark:border-transparent dark:bg-white/4'>
      {children}
    </div>
  );
}

export function FieldLabel({
  children,
  tooltip,
  htmlFor,
}: {
  children: React.ReactNode;
  tooltip?: string;
  htmlFor?: string;
}) {
  return (
    <div className='text-foreground flex items-center justify-between'>
      <Label htmlFor={htmlFor}>{children}</Label>
      {tooltip && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button type='button' tabIndex={-1} aria-label='Help information'>
              <Info
                className='text-muted-foreground/50 hover:text-muted-foreground size-4 shrink-0 transition-colors'
                aria-hidden='true'
              />
            </button>
          </TooltipTrigger>
          <TooltipContent side='top' align='center' role='tooltip'>
            {tooltip}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

export function FieldDescription({ children }: { children: React.ReactNode }) {
  return <div className='text-muted-foreground text-sm'>{children}</div>;
}
