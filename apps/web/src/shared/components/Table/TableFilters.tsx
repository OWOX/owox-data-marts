'use client';

import * as React from 'react';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverDescription,
} from '@owox/ui/components/popover';
import { Button } from '@owox/ui/components/button';
import { AppForm, FormActions, FormLayout } from '@owox/ui/components/form';
import { Filter, ChevronDown } from 'lucide-react';
import { cn } from '@owox/ui/lib/utils';

/* -----------------------------------------------------------------------------
 * Context
 * -------------------------------------------------------------------------- */

const TableFiltersContext = React.createContext<{
  open: boolean;
  setOpen: (open: boolean) => void;
} | null>(null);

function useTableFilters() {
  const ctx = React.useContext(TableFiltersContext);
  if (!ctx) {
    throw new Error('TableFilters components must be used within <TableFilters>');
  }
  return ctx;
}

/* -----------------------------------------------------------------------------
 * Root
 * -------------------------------------------------------------------------- */

interface TableFiltersProps {
  children: React.ReactNode;
}

export function TableFilters({ children }: TableFiltersProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <TableFiltersContext.Provider value={{ open, setOpen }}>
      <Popover open={open} onOpenChange={setOpen}>
        {children}
      </Popover>
    </TableFiltersContext.Provider>
  );
}

/* -----------------------------------------------------------------------------
 * Trigger
 * -------------------------------------------------------------------------- */

interface TableFiltersTriggerProps {
  label?: string;
  icon?: React.ElementType;
}

export function TableFiltersTrigger({
  label = 'Filters',
  icon: Icon = Filter,
}: TableFiltersTriggerProps) {
  const { open } = useTableFilters();

  return (
    <PopoverTrigger asChild>
      <Button variant='outline' size='sm'>
        <Icon className='h-4 w-4' />
        <span className='hidden items-center md:flex'>
          <span className='mr-1'>{label}</span>
          <ChevronDown
            className={cn('h-4 w-4 transition-transform duration-200', open && 'rotate-180')}
          />
        </span>
      </Button>
    </PopoverTrigger>
  );
}

/* -----------------------------------------------------------------------------
 * Content
 * -------------------------------------------------------------------------- */

interface TableFiltersContentProps {
  title?: string;
  description?: string;
  children?: React.ReactNode;
}

export function TableFiltersContent({
  title = 'Filters',
  description = 'Filter your data marts by status, type, and more',
  children,
}: TableFiltersContentProps) {
  const { setOpen } = useTableFilters();

  return (
    <PopoverContent variant='light' align='start'>
      <PopoverHeader>
        <PopoverTitle>{title}</PopoverTitle>
        <PopoverDescription>{description}</PopoverDescription>
      </PopoverHeader>

      <AppForm>
        <FormLayout>
          <div className='space-y-4'>
            {children ?? (
              <div className='text-muted-foreground text-sm'>
                {/* тимчасовий плейсхолдер */}
                Filters UI goes here
              </div>
            )}
          </div>
        </FormLayout>

        <FormActions variant='inline'>
          <Button
            variant='outline'
            size='sm'
            type='button'
            onClick={() => {
              // TODO: clear filters
            }}
          >
            Clear all
          </Button>

          <Button
            size='sm'
            type='button'
            onClick={() => {
              // TODO: apply filters
              setOpen(false);
            }}
          >
            Apply filters
          </Button>
        </FormActions>
      </AppForm>
    </PopoverContent>
  );
}
