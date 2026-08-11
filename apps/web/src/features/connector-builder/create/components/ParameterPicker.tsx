import { Braces } from 'lucide-react';
import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@owox/ui/components/popover';
import { useBuilder } from '../../shared/model/hooks/useBuilder';

/**
 * In-field "{ }" button that inserts a `{{ parameters.X }}` token at the end of a field.
 * Sits at the right edge of an input, so the parent must be `position: relative` and the
 * input needs right padding (e.g. `pr-9`). Renders nothing until at least one parameter exists.
 */
export function ParameterPicker({ onInsert }: { onInsert: (token: string) => void }) {
  const { manifest } = useBuilder();
  const names = Object.keys(manifest.parameters);
  const [open, setOpen] = useState(false);
  if (names.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type='button'
          aria-label='Insert parameter'
          data-testid='parameter-picker'
          title='Insert parameter'
          className='text-muted-foreground hover:bg-accent hover:text-foreground absolute top-1/2 right-1.5 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md transition-colors'
        >
          <Braces className='h-4 w-4' />
        </button>
      </PopoverTrigger>
      <PopoverContent align='end' className='w-48 p-1'>
        <div className='text-muted-foreground px-2 py-1 text-[11px] font-medium'>
          Insert parameter
        </div>
        <div className='max-h-56 overflow-y-auto'>
          {names.map(name => (
            <button
              key={name}
              type='button'
              aria-label={`Insert parameter ${name}`}
              onClick={() => {
                onInsert(`{{ parameters.${name} }}`);
                setOpen(false);
              }}
              className='hover:bg-accent flex w-full items-center gap-2 rounded px-2 py-1.5 text-left font-mono text-[13px]'
            >
              <Braces className='text-muted-foreground h-3.5 w-3.5 shrink-0' />
              {name}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
