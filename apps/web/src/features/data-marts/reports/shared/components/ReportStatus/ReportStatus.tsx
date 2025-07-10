import { cn } from '@owox/ui/lib/utils';
import { ReportStatusEnum } from '../../enums';
import { ReportStatusModel } from '../../models';
import { type ReactNode } from 'react';

interface ReportStatusProps {
  /**
   * The report status
   */
  status: ReportStatusEnum;
  /**
   * Whether to show the status text
   */
  showText?: boolean;
  /**
   * Custom text to display instead of the default status name
   */
  text?: ReactNode;
  /**
   * Whether to show the status icon
   */
  showIcon?: boolean;
  /**
   * Additional CSS classes
   */
  className?: string;
}

export function ReportStatus({
  status,
  showText = true,
  text,
  showIcon = true,
  className,
}: ReportStatusProps) {
  const { icon: Icon, displayName, color } = ReportStatusModel.getInfo(status);

  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      {showIcon && <Icon className={cn('h-5 w-5', color)} />}
      {showText && <span className='text-sm'>{text ?? displayName}</span>}
    </span>
  );
}
