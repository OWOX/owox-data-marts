import { cn } from '@owox/ui/lib/utils';
import type { BaseCardComponentProps } from './types';

export function LookerStudioReportCardContent({
  children,
  className,
  ...props
}: BaseCardComponentProps) {
  return (
    <div className={cn('flex flex-grow flex-col gap-1 px-0 py-4', className)} {...props}>
      {children}
    </div>
  );
}
