import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { cn } from '@owox/ui/lib/utils';
import { Button } from '@owox/ui/components/button';
import { Popover, PopoverContent, PopoverTrigger } from '@owox/ui/components/popover';
import { DATA_MART_ICON_OPTIONS, type DataMartIconKey } from './data-mart-icons';
import { DataMartIconGlyph } from './DataMartIconGlyph';

interface DataMartIconPickerProps {
  icon: DataMartIconKey | null;
  onChange: (icon: DataMartIconKey | null) => Promise<void>;
  className?: string;
}

/** Icon tile beside the Data Mart title; clicking it opens the icon grid. */
export function DataMartIconPicker({ icon, onChange, className }: DataMartIconPickerProps) {
  const [open, setOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const pick = async (next: DataMartIconKey | null) => {
    setOpen(false);
    if (next === icon) return;
    setIsSaving(true);
    try {
      await onChange(next);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type='button'
          className={cn(
            'bg-muted text-foreground hover:bg-accent focus-visible:ring-ring/50 flex size-9 shrink-0 items-center justify-center rounded-md transition-colors outline-none focus-visible:ring-[3px] disabled:opacity-50',
            className
          )}
          aria-label='Change Data Mart icon'
          title='Change icon'
          disabled={isSaving}
          data-testid='dataMartIconPicker'
        >
          <DataMartIconGlyph icon={icon} className='size-5' aria-hidden='true' />
        </button>
      </PopoverTrigger>
      <PopoverContent align='start' className='w-auto p-3'>
        <div
          className='-mr-1 grid max-h-[min(26rem,60vh)] grid-cols-8 gap-1 overflow-y-auto pr-1'
          role='group'
          aria-label='Data Mart icons'
        >
          {DATA_MART_ICON_OPTIONS.map(({ key, label, icon: Icon }) => {
            const selected = key === icon;
            return (
              <button
                key={key}
                type='button'
                aria-pressed={selected}
                aria-label={label}
                title={label}
                onClick={() => void pick(key)}
                className={cn(
                  'text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring/50 flex size-8 items-center justify-center rounded-md transition-colors outline-none focus-visible:ring-[3px]',
                  selected && 'bg-primary/10 text-primary ring-primary/40 ring-1'
                )}
              >
                <Icon className='size-4' aria-hidden='true' />
              </button>
            );
          })}
        </div>
        <Button
          variant='ghost'
          size='sm'
          className='text-muted-foreground mt-2 w-full justify-start'
          disabled={icon === null}
          onClick={() => void pick(null)}
        >
          <RotateCcw aria-hidden='true' />
          Reset to default
        </Button>
      </PopoverContent>
    </Popover>
  );
}
