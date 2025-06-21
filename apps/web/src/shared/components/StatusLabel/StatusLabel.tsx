import { cn } from '@owox/ui/lib/utils';
import { StatusTypeEnum, type StatusLabelProps, type StatusVariant } from './types';
import { getStatusVariantClasses, statusConfig } from './status.config.ts';

export function StatusLabel({
  type = StatusTypeEnum.NEUTRAL,
  variant = 'ghost',
  showIcon = true,
  children,
  className,
}: StatusLabelProps) {
  const { icon: Icon, colors } = statusConfig[type];

  const getComponentClasses = (variant: StatusVariant) => {
    const baseClasses = 'inline-flex items-center gap-1 text-sm';
    const variantClasses = getStatusVariantClasses(variant);
    const colorClasses = colors[variant];

    return cn(baseClasses, variantClasses, colorClasses, className);
  };

  return (
    <span className={getComponentClasses(variant)}>
      {showIcon && <Icon className='h-4 w-4' data-testid='icon' />}
      {children}
    </span>
  );
}
