import type React from 'react';
import { useState } from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@owox/ui/components/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@owox/ui/components/command';
import { cn } from '@owox/ui/lib/utils';
import { Badge } from '@owox/ui/components/badge';
import { Button } from '@owox/ui/components/button';

interface MultiSelectProps {
  options: { value: number; label: string }[];
  selected: number[];
  onSelectionChange: (selected: number[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
  maxDisplayItems?: number;
}

export function MultiSelect({
  options,
  selected,
  onSelectionChange,
  placeholder = 'Select items...',
  searchPlaceholder = 'Search...',
  maxDisplayItems = 3,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);

  const handleSelect = (value: number) => {
    const newSelected = selected.includes(value)
      ? selected.filter(item => item !== value)
      : [...selected, value].sort((a, b) => a - b);
    onSelectionChange(newSelected);
  };

  const handleRemove = (value: number, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onSelectionChange(selected.filter(item => item !== value));
  };

  const getDisplayText = () => {
    if (selected.length === 0) {
      return <span className="text-muted-foreground text-sm">{placeholder}</span>;
    }

    const selectedOptions = selected
      .map(value => options.find(option => option.value === value))
      .filter(Boolean);

    if (selectedOptions.length <= maxDisplayItems) {
      return (
        <div className="flex flex-wrap gap-1">
          {selectedOptions.map(option => (
            <Badge key={option!.value} variant="secondary" className="text-xs h-5">
              {option!.label}
              <span
                className="ml-1 hover:bg-secondary-foreground/20 rounded-full p-0.5 cursor-pointer inline-flex items-center justify-center"
                onClick={e => handleRemove(option!.value, e)}
              >
                <X className="h-2 w-2" />
              </span>
            </Badge>
          ))}
        </div>
      );
    }

    return (
      <div className="flex items-center gap-1">
        <Badge variant="secondary" className="text-xs h-5">
          {selectedOptions[0]!.label}
          <span
            className="ml-1 hover:bg-secondary-foreground/20 rounded-full p-0.5 cursor-pointer inline-flex items-center justify-center"
            onClick={e => handleRemove(selectedOptions[0]!.value, e)}
          >
            <X className="h-2 w-2" />
          </span>
        </Badge>
        {selectedOptions.length > 1 && (
          <Badge variant="outline" className="text-xs h-5">
            +{selectedOptions.length - 1}
          </Badge>
        )}
      </div>
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between bg-transparent h-9 min-h-9 py-1"
        >
          <div className="flex-1 text-left">{getDisplayText()}</div>
          <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0 max-h-[400px] overflow-y-auto" style={{ padding: 0 }}>
        <Command className="overflow-visible h-full">
          <CommandInput placeholder={searchPlaceholder} className="h-8" />
          <CommandList className="max-h-[350px] h-full overflow-y-auto">
            <CommandEmpty>No items found.</CommandEmpty>
            <CommandGroup className="overflow-visible h-full">
              {options.map(option => (
                <CommandItem
                  key={option.value}
                  value={option.value.toString()}
                  onSelect={() => handleSelect(option.value)}
                  className="text-sm"
                >
                  <Check
                    className={cn(
                      'mr-2 h-3 w-3',
                      selected.includes(option.value) ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
