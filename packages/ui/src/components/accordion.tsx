'use client';

import * as React from 'react';
import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { ChevronDownIcon, MessageCircleQuestion } from 'lucide-react';

import { cn } from '@owox/ui/lib/utils';

/**
 * Type for accordion variant
 */
type AccordionVariant = 'default' | 'common';

/**
 * Map of styles, icons, and classes for each variant
 */
const ACCORDION_VARIANTS: Record<
  AccordionVariant,
  {
    itemClass: string;
    triggerClass: string;
    icon: React.ReactNode;
    chevronClass: string;
    contentClass: string;
    contentInnerClass: string;
    headerClass?: string;
  }
> = {
  default: {
    itemClass: 'border-b last:border-b-0',
    triggerClass:
      'focus-visible:border-ring focus-visible:ring-ring/50 flex flex-1 items-start justify-between gap-4 rounded-md py-4 text-left text-sm font-medium transition-all outline-none hover:underline focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 [&[data-state=open]>svg]:rotate-180',
    icon: null,
    chevronClass:
      'text-muted-foreground pointer-events-none size-4 shrink-0 translate-y-0.5 transition-transform duration-200',
    contentClass:
      'data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down overflow-hidden text-sm',
    contentInnerClass: 'pt-0 pb-4',
    headerClass: 'flex',
  },
  common: {
    itemClass: 'overflow-hidden',
    triggerClass:
      'group focus-visible:ring-primary hover:bg-muted [&[data-state=open]]:bg-muted flex items-center gap-1 rounded-sm px-2 py-1 transition-all outline-none focus-visible:ring-2 [&[data-state=open]]:rounded-br-none [&[data-state=open]]:rounded-bl-none [&[data-state=open]]:font-semibold',
    icon: <MessageCircleQuestion className='size-4 shrink-0' aria-hidden='true' />,
    chevronClass:
      'size-3.5 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180',
    contentClass:
      'data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down bg-muted overflow-hidden rounded-sm rounded-tl-none py-0 pr-2 pl-7 text-sm',
    contentInnerClass: 'pt-2 pb-4',
    headerClass: undefined,
  },
};

// Context for variant
const AccordionVariantContext = React.createContext<AccordionVariant>('default');

/**
 * Accordion component
 * @param variant - 'default' (standard style) or 'common' (alternative style)
 */
function Accordion({
  variant = 'default',
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Root> & { variant?: AccordionVariant }) {
  return (
    <AccordionVariantContext.Provider value={variant}>
      <AccordionPrimitive.Root data-slot='accordion' {...props} />
    </AccordionVariantContext.Provider>
  );
}

// Hook to get variant from prop or context
function useAccordionVariant(propVariant?: AccordionVariant) {
  const contextVariant = React.useContext(AccordionVariantContext);
  return propVariant ?? contextVariant ?? 'default';
}

/**
 * AccordionItem component
 * @param variant - accordion style variant
 */
function AccordionItem({
  className,
  variant,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Item> & { variant?: AccordionVariant }) {
  const v = useAccordionVariant(variant);
  const { itemClass } = ACCORDION_VARIANTS[v];
  return (
    <AccordionPrimitive.Item
      data-slot='accordion-item'
      className={cn(itemClass, className)}
      {...props}
    />
  );
}

/**
 * AccordionTrigger component
 * @param variant - accordion style variant
 */
function AccordionTrigger({
  className,
  children,
  variant,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Trigger> & { variant?: AccordionVariant }) {
  const v = useAccordionVariant(variant);
  const { triggerClass, icon, chevronClass, headerClass } = ACCORDION_VARIANTS[v];
  return (
    <AccordionPrimitive.Header className={headerClass}>
      <AccordionPrimitive.Trigger
        data-slot='accordion-trigger'
        className={cn(triggerClass, className)}
        {...props}
      >
        {icon}
        {children}
        <ChevronDownIcon className={chevronClass} aria-hidden='true' />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

/**
 * AccordionContent component
 * @param variant - accordion style variant
 */
function AccordionContent({
  className,
  children,
  variant,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Content> & { variant?: AccordionVariant }) {
  const v = useAccordionVariant(variant);
  const { contentClass, contentInnerClass } = ACCORDION_VARIANTS[v];
  return (
    <AccordionPrimitive.Content
      data-slot='accordion-content'
      className={cn(contentClass, className)}
      {...props}
    >
      <div className={contentInnerClass}>{children}</div>
    </AccordionPrimitive.Content>
  );
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
