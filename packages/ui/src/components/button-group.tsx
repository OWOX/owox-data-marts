import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@owox/ui/lib/utils';

const buttonGroupVariants = cva('inline-flex items-center justify-center gap-0 w-fit rounded-md', {
  variants: {
    orientation: {
      horizontal: 'flex-row',
      vertical: 'flex-col',
    },
    variant: {
      default: 'bg-muted p-[3px]',
      outline: 'border bg-background shadow-xs dark:bg-white/4',
      ghost: '',
    },
  },
  defaultVariants: {
    orientation: 'horizontal',
    variant: 'default',
  },
});

interface ButtonGroupProps
  extends React.ComponentProps<'div'>,
    VariantProps<typeof buttonGroupVariants> {
  value?: string | string[];
  onValueChange?: (value: string | string[]) => void;
  multiSelect?: boolean;
}

function ButtonGroup({
  className,
  orientation,
  variant,
  children,
  value,
  onValueChange,
  multiSelect = false,
  ...props
}: ButtonGroupProps) {
  const childArray = React.Children.toArray(children);

  const handleClick = (buttonValue: string) => {
    if (!onValueChange) return;

    if (multiSelect) {
      const selectedArray = Array.isArray(value) ? value : value !== undefined ? [value] : [];
      const newSelected = selectedArray.includes(buttonValue)
        ? selectedArray.filter(v => v !== buttonValue)
        : [...selectedArray, buttonValue];
      onValueChange(newSelected);
    } else {
      onValueChange(buttonValue);
    }
  };

  const isSelected = (buttonValue: string | undefined): boolean => {
    if (value === undefined || buttonValue === undefined) return false;
    return Array.isArray(value) ? value.includes(buttonValue) : value === buttonValue;
  };

  return (
    <div
      role='group'
      data-slot='button-group'
      className={cn(buttonGroupVariants({ orientation, variant }), className)}
      {...props}
    >
      {React.Children.map(childArray, (child, index) => {
        if (!React.isValidElement(child)) return child;

        const isFirst = index === 0;
        const isLast = index === childArray.length - 1;
        const isHorizontal = orientation !== 'vertical';

        type ButtonProps = { className?: string; onClick?: () => void; value?: string };
        const childElement = child as React.ReactElement<ButtonProps>;
        const buttonValue = childElement.props.value;
        const selected = isSelected(buttonValue);

        const positionClasses = cn(
          variant === 'ghost' && 'border border-transparent',
          !isFirst && !isLast && isHorizontal && 'rounded-none border-x-0',
          !isFirst && !isLast && !isHorizontal && 'rounded-none border-y-0',
          isFirst && isHorizontal && 'rounded-r-none border-r-0',
          isFirst && !isHorizontal && 'rounded-b-none border-b-0',
          isLast && isHorizontal && 'rounded-l-none border-l-0',
          isLast && !isHorizontal && 'rounded-t-none border-t-0',
          selected &&
            variant === 'default' &&
            'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 dark:bg-primary dark:text-primary-foreground',
          selected &&
            variant === 'outline' &&
            'bg-primary text-primary-foreground border-primary shadow-sm hover:bg-primary/90 dark:bg-primary dark:text-primary-foreground dark:border-primary',
          selected &&
            variant === 'ghost' &&
            'bg-primary text-primary-foreground hover:bg-primary/90 dark:bg-primary'
        );

        const originalOnClick = childElement.props.onClick;

        return React.cloneElement(childElement, {
          className: cn(childElement.props.className, positionClasses),
          onClick: () => {
            if (buttonValue !== undefined) {
              handleClick(buttonValue);
            }
            originalOnClick?.();
          },
        });
      })}
    </div>
  );
}

export { ButtonGroup, buttonGroupVariants };
