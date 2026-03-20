import * as React from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';

import { Button } from '@owox/ui/components/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@owox/ui/components/command';
import { Popover, PopoverContent, PopoverTrigger } from '@owox/ui/components/popover';
import { cn } from '@owox/ui/lib/utils';

export interface ComboboxOption {
  value: string;
  label: string;
  group?: string;
  separator?: boolean;
}

interface ComboboxProps {
  options: ComboboxOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  emptyMessage?: string;
  className?: string;
  disabled?: boolean;
  renderLabel?: (option: ComboboxOption) => React.ReactNode;
}

function filterOptions(value: string, search: string, keywords?: string[]): number {
  const searchTarget = keywords?.join(' ') ?? value;
  return searchTarget.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
}

export function Combobox({
  options,
  value,
  onValueChange,
  placeholder = 'Select an option',
  emptyMessage = 'No results found.',
  className,
  disabled = false,
  renderLabel,
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

  const handleSelect = React.useCallback(
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
        className='w-[var(--radix-popover-trigger-width)] p-0'
        align='start'
        sideOffset={5}
      >
        <Command
          filter={filterOptions}
          className='[&_[data-slot=command-input-wrapper]]:gap-3 [&_[data-slot=command-input-wrapper]]:px-4'
        >
          <CommandInput
            placeholder='Search...'
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandList className='max-h-[300px] overflow-auto'>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            {Object.entries(groupedOptions).map(([groupName, groupOptions]) => {
              return (
                <CommandGroup key={groupName || 'default'} heading={groupName}>
                  {groupOptions.map(option => (
                    <React.Fragment key={option.value}>
                      {option.separator && <CommandSeparator />}
                      <CommandItem
                        value={option.value}
                        onSelect={() => {
                          handleSelect(option.value);
                        }}
                        keywords={[option.label]}
                        className='min-w-0 justify-between'
                      >
                        {renderLabel ? (
                          renderLabel(option)
                        ) : (
                          <span className='min-w-0 flex-1 truncate'>{option.label}</span>
                        )}
                        <Check
                          className={cn(
                            'ml-2 h-4 w-4 shrink-0',
                            value === option.value ? 'opacity-100' : 'opacity-0'
                          )}
                        />
                      </CommandItem>
                    </React.Fragment>
                  ))}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
