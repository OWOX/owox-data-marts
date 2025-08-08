'use client';

import * as React from 'react';
import * as HoverCardPrimitive from '@radix-ui/react-hover-card';

import { cn } from '@owox/ui/lib/utils';

const HoverCard = ({ ...props }: HoverCardPrimitive.HoverCardProps) => {
  return <HoverCardPrimitive.Root data-slot='hover-card' {...props} />;
};
HoverCard.displayName = 'HoverCard';

const HoverCardTrigger = React.forwardRef<
  React.ElementRef<typeof HoverCardPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof HoverCardPrimitive.Trigger>
>(({ ...props }, ref) => (
  <HoverCardPrimitive.Trigger data-slot='hover-card-trigger' ref={ref} {...props} />
));
HoverCardTrigger.displayName = 'HoverCardTrigger';

const HoverCardContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof HoverCardPrimitive.Content>
>(({ className, align = 'center', sideOffset = 4, onClick, ...props }, ref) => {
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (onClick) {
      onClick(e);
    }
  };

  return (
    <HoverCardPrimitive.Portal>
      <HoverCardPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'bg-popover text-popover-foreground z-50 w-110 rounded-lg border px-6 py-4 shadow-md outline-none',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2',
          'data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
          className
        )}
        onClick={handleClick}
        {...props}
      />
    </HoverCardPrimitive.Portal>
  );
});
HoverCardContent.displayName = 'HoverCardContent';

const HoverCardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('border-border flex gap-4 border-b pb-4', className)} {...props} />
  )
);
HoverCardHeader.displayName = 'HoverCardHeader';

const HoverCardHeaderIcon = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'bg-muted flex h-14 min-h-[56px] w-14 min-w-[56px] shrink-0 items-center justify-center rounded-full',
        className
      )}
      {...props}
    />
  )
);
HoverCardHeaderIcon.displayName = 'HoverCardHeaderIcon';

const HoverCardHeaderText = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1', className)} {...props} />
  )
);
HoverCardHeaderText.displayName = 'HoverCardHeaderText';

const HoverCardHeaderTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h2 ref={ref} className={cn('text-md pt-1 leading-snug font-semibold', className)} {...props} />
));
HoverCardHeaderTitle.displayName = 'HoverCardHeaderTitle';

const HoverCardHeaderDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-muted-foreground text-sm', className)} {...props} />
));
HoverCardHeaderDescription.displayName = 'HoverCardHeaderDescription';

const HoverCardBody = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col', className)} {...props} />
  )
);
HoverCardBody.displayName = 'HoverCardBody';

const HoverCardItem = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('border-border flex items-center justify-between border-b py-4', className)}
      {...props}
    />
  )
);
HoverCardItem.displayName = 'HoverCardItem';

const HoverCardItemLabel = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => (
    <span ref={ref} className={cn('text-muted-foreground text-sm', className)} {...props} />
  )
);
HoverCardItemLabel.displayName = 'HoverCardItemLabel';

const HoverCardItemValue = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => (
    <span ref={ref} className={cn('text-sm', className)} {...props} />
  )
);
HoverCardItemValue.displayName = 'HoverCardItemValue';

const HoverCardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('pt-4 pb-2', className)} {...props} />
  )
);
HoverCardFooter.displayName = 'HoverCardFooter';

export {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
  HoverCardHeader,
  HoverCardHeaderText,
  HoverCardHeaderIcon,
  HoverCardHeaderTitle,
  HoverCardHeaderDescription,
  HoverCardBody,
  HoverCardItem,
  HoverCardItemLabel,
  HoverCardItemValue,
  HoverCardFooter,
};
