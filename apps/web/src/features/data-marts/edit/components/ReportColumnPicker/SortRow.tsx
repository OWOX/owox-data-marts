import type { HTMLAttributes } from 'react';
import { Button } from '@owox/ui/components/button';
import { ArrowDown, ArrowUp, GripVertical, X } from 'lucide-react';
import type { SortRule } from '../../../shared/types/output-config';

interface SortRowProps {
  rule: SortRule;
  index: number;
  onChange: (next: SortRule) => void;
  onRemove: () => void;
  dragHandleProps?: HTMLAttributes<HTMLSpanElement>;
}

export function SortRow({ rule, index, onChange, onRemove, dragHandleProps }: SortRowProps) {
  const toggleDirection = () => {
    onChange({ ...rule, direction: rule.direction === 'asc' ? 'desc' : 'asc' });
  };
  const ArrowIcon = rule.direction === 'asc' ? ArrowUp : ArrowDown;

  return (
    <div className='bg-muted/40 flex items-center gap-2 rounded px-2 py-1.5'>
      <span
        {...dragHandleProps}
        className='text-muted-foreground cursor-grab'
        aria-label='Drag to reorder'
      >
        <GripVertical className='h-4 w-4' />
      </span>
      <span className='text-muted-foreground w-4 text-xs tabular-nums'>{index + 1}</span>
      <span className='flex-1 truncate font-mono text-xs' title={rule.column}>
        {rule.column}
      </span>
      <Button
        variant='ghost'
        size='sm'
        className='text-muted-foreground hover:text-foreground h-6 gap-1 px-1.5 text-[11px]'
        onClick={toggleDirection}
        aria-label={`Toggle direction (currently ${rule.direction})`}
      >
        <ArrowIcon className='h-4 w-4' />
        <span className='inline-block w-7 text-left'>{rule.direction}</span>
      </Button>
      <Button
        variant='ghost'
        size='sm'
        className='text-muted-foreground hover:text-foreground h-6 w-6 p-0'
        onClick={onRemove}
        aria-label='Remove sort'
      >
        <X className='h-4 w-4' />
      </Button>
    </div>
  );
}
