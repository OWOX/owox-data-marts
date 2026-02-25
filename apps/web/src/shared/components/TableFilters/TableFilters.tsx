'use client';

import * as React from 'react';
import { Popover } from '@owox/ui/components/popover';
import { DEFAULT_FILTERS_STATE, type FiltersState } from './types';

/* ---------------------------------------------------------------------------
 * Context
 * ------------------------------------------------------------------------ */

interface TableFiltersContextValue<K extends string = string> {
  open: boolean;
  setOpen: (open: boolean) => void;
  appliedState: FiltersState<K>;
  onApply: (state: FiltersState<K>) => void;
  onClear: () => void;
}

const TableFiltersContext = React.createContext<TableFiltersContextValue | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useTableFilters<K extends string = string>() {
  const ctx = React.useContext(TableFiltersContext);
  if (!ctx) {
    throw new Error('TableFilters components must be used within <TableFilters>');
  }
  return ctx as unknown as TableFiltersContextValue<K>;
}

/* ---------------------------------------------------------------------------
 * Root
 * ------------------------------------------------------------------------ */

const noop = () => {
  /* no-op */
};

interface TableFiltersProps<K extends string = string> {
  children: React.ReactNode;
  appliedState?: FiltersState<K>;
  onApply?: (state: FiltersState<K>) => void;
  onClear?: () => void;
}

export function TableFilters<K extends string = string>({
  children,
  appliedState = DEFAULT_FILTERS_STATE as FiltersState<K>,
  onApply = noop,
  onClear = noop,
}: TableFiltersProps<K>) {
  const [open, setOpen] = React.useState(false);

  const value = React.useMemo<TableFiltersContextValue<K>>(
    () => ({ open, setOpen, appliedState, onApply, onClear }),
    [open, appliedState, onApply, onClear]
  );

  return (
    <TableFiltersContext.Provider value={value as unknown as TableFiltersContextValue}>
      <Popover open={open} onOpenChange={setOpen}>
        {children}
      </Popover>
    </TableFiltersContext.Provider>
  );
}
