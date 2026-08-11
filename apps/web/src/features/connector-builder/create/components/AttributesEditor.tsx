import { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@owox/ui/components/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@owox/ui/components/command';
import { cn } from '@owox/ui/lib/utils';
import { Badge } from '@owox/ui/components/badge';
import { Button } from '@owox/ui/components/button';

/**
 * The subset of `ManifestParameter.attributes` a no-code author can toggle from this
 * control. `SECRET` has its own checkbox column, `OAUTH_FLOW` is managed by the
 * Authentication editor, and `DEPRECATED` is Code-mode only — none of the three are
 * shown here or ever written back by this component.
 */
export const AUTHORABLE_ATTRIBUTES = [
  {
    value: 'MANUAL_BACKFILL',
    label: 'Manual backfill',
    hint: 'User may override this on a one-off backfill run.',
  },
  {
    value: 'HIDE_IN_CONFIG_FORM',
    label: 'Hide in config form',
    hint: 'Do not show this field in the connector setup form.',
  },
  {
    value: 'PINNED',
    label: 'Pinned',
    hint: 'Sort this field to the top of the setup form.',
  },
  {
    value: 'ADVANCED',
    label: 'Advanced',
    hint: 'Group this field under the collapsed "Advanced settings".',
  },
] as const;

interface AttributesEditorProps {
  /** The param's current attributes. May contain values this control doesn't own
   * (e.g. `SECRET`, `OAUTH_FLOW`) — those are ignored for display and are never
   * touched by this component. */
  value: string[];
  /** Reports ONE attribute at a time — never the whole array. The caller owns
   * merging this into the param's full `attributes` list (e.g. via a `Set`), which
   * is what keeps co-existing attributes this control doesn't display intact. */
  onToggle: (attr: string, checked: boolean) => void;
}

/** Compact multiselect for the parameter table's "Attributes" column. Mirrors the
 * structure of the shared `@owox/ui` multi-select (Popover/Command/Badge), but is
 * string-typed and local to a fixed, small option set — the shared component is
 * `number`-typed and used by 8+ other consumers, so it isn't reused directly here. */
export function AttributesEditor({ value, onToggle }: AttributesEditorProps) {
  const [open, setOpen] = useState(false);

  const selected = AUTHORABLE_ATTRIBUTES.filter(a => value.includes(a.value));

  /**
   * Always ONE line: the trigger is a fixed-height row control in a narrow table column,
   * and these labels are long ("Hide in config form"). Wrapping the badges spilled them
   * out of the button and pushed the row open, so the first label truncates and the rest
   * collapse into a counter — the full set is one click away in the popover.
   */
  const getDisplayText = () => {
    if (selected.length === 0) {
      return <span className='text-muted-foreground text-sm'>None</span>;
    }
    return (
      <div className='flex min-w-0 items-center gap-1'>
        {/* `shrink` overrides the Badge's own `shrink-0`, so a long label ellipsizes here
            rather than shoving the counter and the chevron out of the control. */}
        <Badge variant='secondary' className='h-5 min-w-0 shrink truncate text-xs'>
          {selected[0].label}
        </Badge>
        {selected.length > 1 && (
          <Badge variant='outline' className='h-5 text-xs'>
            +{selected.length - 1}
          </Badge>
        )}
      </div>
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        <Button
          type='button'
          variant='outline'
          aria-expanded={open}
          aria-label='Attributes'
          className='h-8 min-h-8 w-full justify-between bg-transparent px-2 py-1'
        >
          {/* min-w-0 lets this flex child shrink below its content, which is what makes
              the badge's truncation actually engage. */}
          <div className='min-w-0 flex-1 text-left'>{getDisplayText()}</div>
          <ChevronsUpDown className='ml-2 h-3 w-3 shrink-0 opacity-50' />
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-64 p-0' align='start'>
        <Command>
          <CommandList className='max-h-none overflow-visible'>
            <CommandEmpty>No attributes found.</CommandEmpty>
            <CommandGroup>
              {AUTHORABLE_ATTRIBUTES.map(attr => {
                const checked = value.includes(attr.value);
                return (
                  <CommandItem
                    key={attr.value}
                    value={attr.value}
                    onSelect={() => {
                      onToggle(attr.value, !checked);
                    }}
                    className='text-sm'
                  >
                    <Check className={cn('h-3 w-3', checked ? 'opacity-100' : 'opacity-0')} />
                    <div className='flex flex-col'>
                      <span>{attr.label}</span>
                      <span className='text-muted-foreground text-[11px]'>{attr.hint}</span>
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
