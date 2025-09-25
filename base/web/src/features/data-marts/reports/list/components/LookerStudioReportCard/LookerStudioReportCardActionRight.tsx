import { cn } from '@owox/ui/lib/utils';
import type { BaseCardComponentProps } from './types';

export function LookerStudioReportCardActionRight({
  children,
  className,
  ...props
}: BaseCardComponentProps) {
  return (
    <div
      className={cn('flex flex-shrink-0 items-center justify-center self-center p-4', className)}
      {...props}
    >
      {children}
    </div>
  );
}
