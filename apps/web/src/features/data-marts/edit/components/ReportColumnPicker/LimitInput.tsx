import { Input } from '@owox/ui/components/input';
import { Button } from '@owox/ui/components/button';
import { X } from 'lucide-react';

interface LimitInputProps {
  value: number | null;
  onChange: (value: number | null) => void;
}

export function LimitInput({ value, onChange }: LimitInputProps) {
  return (
    <div className='flex items-center gap-2'>
      <div className='relative w-40'>
        <Input
          type='number'
          min={1}
          max={10_000_000}
          value={value ?? ''}
          placeholder='All'
          onChange={e => {
            const raw = e.target.value;
            if (raw === '') {
              onChange(null);
              return;
            }
            const n = Number(raw);
            onChange(Number.isFinite(n) && n > 0 ? Math.floor(n) : null);
          }}
          className='[appearance:textfield] pr-7 font-mono [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
          aria-label='Row limit'
        />
        {value != null && (
          <Button
            type='button'
            variant='ghost'
            size='sm'
            className='text-muted-foreground hover:text-foreground absolute top-1/2 right-1 h-6 w-6 -translate-y-1/2 p-0'
            onClick={() => {
              onChange(null);
            }}
            aria-label='Clear limit'
          >
            <X className='h-4 w-4' />
          </Button>
        )}
      </div>
      <span className='text-muted-foreground text-xs'>rows</span>
    </div>
  );
}
