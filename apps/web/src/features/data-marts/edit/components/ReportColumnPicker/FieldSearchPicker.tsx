import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import { Popover, PopoverContent, PopoverTrigger } from '@owox/ui/components/popover';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@owox/ui/components/command';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';

// Substring match over the readable field name, data-mart name, and the raw
// field identifier (the item keywords) — so power users can still search by the
// technical name. cmdk's default fuzzy scorer normalises the value, which makes
// dotted-name search erratic.
function commandFilter(value: string, search: string, keywords?: string[]): number {
  const target = keywords?.join(' ') ?? value;
  return target.toLowerCase().includes(search.trim().toLowerCase()) ? 1 : 0;
}

export interface FieldPickerItem {
  /** Stored identifier handed back on select. */
  value: string;
  /** Business-readable field name (line 1). */
  label: string;
  /** Joined data mart name (muted line 2); omit for home-mart fields. */
  dataMartName?: string;
  /** Full path segments, shown as a vertical tree on hover. */
  path?: string[];
}

/** Vertical, indented path so a deep join chain never overflows the sidebar. */
export function PathTree({ segments }: { segments: readonly string[] }) {
  return (
    <div className='font-mono text-[11px] leading-snug'>
      {segments.map((seg, i) => (
        <div key={i} style={{ paddingLeft: i * 12 }}>
          {i > 0 && <span className='opacity-50'>› </span>}
          {seg}
        </div>
      ))}
    </div>
  );
}

interface FieldSearchPickerProps {
  items: readonly FieldPickerItem[];
  /** Trigger text, e.g. 'Add filter'. */
  placeholder: string;
  searchPlaceholder?: string;
  onSelect: (value: string) => void;
}

export function FieldSearchPicker({
  items,
  placeholder,
  searchPlaceholder = 'Search fields…',
  onSelect,
}: FieldSearchPickerProps) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        <Button
          variant='outline'
          size='sm'
          className='text-muted-foreground h-7 w-full justify-start text-xs'
          aria-expanded={open}
          aria-haspopup='listbox'
        >
          <Plus className='mr-1 h-4 w-4' />
          {placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent align='start' className='w-[var(--radix-popover-trigger-width)] p-0'>
        <Command filter={commandFilter}>
          <CommandInput placeholder={searchPlaceholder} className='h-8' />
          <CommandList>
            <CommandEmpty>No fields found.</CommandEmpty>
            {items.map(item => {
              const content = (
                <span className='flex min-w-0 flex-1 flex-col'>
                  <span className='truncate'>{item.label}</span>
                  {item.dataMartName && (
                    <span className='text-muted-foreground truncate text-[11px]'>
                      {item.dataMartName}
                    </span>
                  )}
                </span>
              );
              const tree = item.path && item.path.length > 1 ? item.path : null;
              return (
                <CommandItem
                  key={item.value}
                  value={item.value}
                  keywords={[
                    item.label,
                    item.value,
                    ...(item.dataMartName ? [item.dataMartName] : []),
                  ]}
                  // Use the closure value, not cmdk's normalized arg.
                  onSelect={() => {
                    onSelect(item.value);
                    setOpen(false);
                  }}
                >
                  {tree ? (
                    <Tooltip delayDuration={600}>
                      <TooltipTrigger asChild>{content}</TooltipTrigger>
                      <TooltipContent
                        side='bottom'
                        align='start'
                        collisionPadding={8}
                        className='max-w-[min(20rem,calc(100vw-1.5rem))]'
                      >
                        <PathTree segments={tree} />
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    content
                  )}
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
