import * as React from 'react';
import { useCallback } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';

import { Button } from '@owox/ui/components/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@owox/ui/components/command';
import { Popover, PopoverContent, PopoverTrigger } from '@owox/ui/components/popover';
import { cn } from '@owox/ui/lib/utils';

export interface ComboboxOption {
  value: string;
  label: string;
  group?: string;
}

interface ComboboxProps {
  options: ComboboxOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  emptyMessage?: string;
  className?: string;
  disabled?: boolean;
}

export function Combobox({
  options,
  value,
  onValueChange,
  placeholder = 'Select an option',
  emptyMessage = 'No results found.',
  className,
  disabled = false,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');

  const groupedOptions = React.useMemo(() => {
    const groups: Record<string, ComboboxOption[]> = {};

    options.forEach(option => {
      const groupName = option.group ?? '';
      if (!Object.prototype.hasOwnProperty.call(groups, groupName)) {
        groups[groupName] = [];
      }
      groups[groupName].push(option);
    });

    return groups;
  }, [options]);

  const selectedOption = options.find(option => option.value === value);

  const handleSelect = useCallback(
    (optionValue: string) => {
      onValueChange(optionValue);
      requestAnimationFrame(() => {
        setSearchQuery('');
        setOpen(false);
      });
    },
    [onValueChange]
  );

  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        <Button
          variant='outline'
          role='combobox'
          aria-expanded={open}
          className={cn('w-full justify-between', !value && 'text-muted-foreground', className)}
          disabled={disabled}
        >
          <span className='min-w-0 flex-1 truncate text-left'>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <ChevronsUpDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className='max-h-[300px] min-w-[300px] overflow-auto p-0'
        align='start'
        sideOffset={5}
      >
        <Command>
          <CommandInput
            placeholder={`Search ${placeholder.toLowerCase()}...`}
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandEmpty>{emptyMessage}</CommandEmpty>
          {Object.entries(groupedOptions).map(([groupName, groupOptions]) => {
            return (
              <CommandGroup key={groupName || 'default'} heading={groupName}>
                {groupOptions.map(option => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    onSelect={() => {
                      handleSelect(option.value);
                    }}
                    keywords={[option.label]}
                    className='min-w-0'
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        value === option.value ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <span className='truncate'>{option.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            );
          })}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
