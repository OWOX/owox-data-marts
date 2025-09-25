import { cn } from '@owox/ui/lib/utils';
import type { BaseCardComponentProps } from './types';

export function LookerStudioReportCardActionLeft({
  children,
  className,
  ...props
}: BaseCardComponentProps) {
  return (
    <div
      className={cn('flex flex-shrink-0 items-start justify-center py-5 pl-6', className)}
      {...props}
    >
      {children}
    </div>
  );
}
