import { cn } from '@owox/ui/lib/utils';
import type { BaseCardComponentProps } from './types';

export function LookerStudioReportCardDescription({
  children,
  className,
  ...props
}: BaseCardComponentProps) {
  return (
    <div className={cn('text-muted-foreground text-sm', className)} {...props}>
      {children}
    </div>
  );
}
