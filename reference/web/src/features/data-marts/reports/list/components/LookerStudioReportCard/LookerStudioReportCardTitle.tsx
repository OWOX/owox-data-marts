import { cn } from '@owox/ui/lib/utils';
import type { BaseCardComponentProps } from './types';

export function LookerStudioReportCardTitle({
  children,
  className,
  ...props
}: BaseCardComponentProps) {
  return (
    <div className={cn('text-md font-medium', className)} {...props}>
      {children}
    </div>
  );
}
