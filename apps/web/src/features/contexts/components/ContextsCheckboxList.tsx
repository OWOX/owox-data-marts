import { Checkbox } from '@owox/ui/components/checkbox';
import { Label } from '@owox/ui/components/label';
import { Button } from '@owox/ui/components/button';
import { Plus } from 'lucide-react';
import type { ContextDto } from '../types/context.types';

interface ContextsCheckboxListProps {
  idPrefix: string;
  contexts: ContextDto[];
  selectedIds: string[];
  onToggle: (contextId: string, checked: boolean) => void;
  disabled?: boolean;
  emptyText?: string;
  onRequestCreate?: () => void;
}

export function ContextsCheckboxList({
  idPrefix,
  contexts,
  selectedIds,
  onToggle,
  disabled,
  emptyText,
  onRequestCreate,
}: ContextsCheckboxListProps) {
  const createButton = onRequestCreate ? (
    <Button
      type='button'
      variant='ghost'
      size='sm'
      className='text-muted-foreground hover:text-foreground mt-1 w-fit'
      onClick={onRequestCreate}
      disabled={disabled}
    >
      <Plus className='mr-1 h-4 w-4' />
      Create context
    </Button>
  ) : null;

  if (contexts.length === 0) {
    const fallback = onRequestCreate
      ? 'No contexts yet.'
      : 'No contexts available. Create one in the Contexts tab.';
    return (
      <div className='flex flex-col gap-1'>
        <div className='border-input text-muted-foreground rounded-md border py-4 text-center text-sm'>
          {emptyText ?? fallback}
        </div>
        {createButton}
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-1'>
      <div className='border-input flex flex-col gap-1 rounded-md border p-1'>
        {contexts.map(ctx => {
          const checked = selectedIds.includes(ctx.id);
          const id = `${idPrefix}-${ctx.id}`;
          return (
            <div key={ctx.id} className='hover:bg-muted/50 flex items-center gap-3 rounded-md p-2'>
              <Checkbox
                id={id}
                checked={checked}
                onCheckedChange={val => {
                  onToggle(ctx.id, val === true);
                }}
                disabled={disabled}
              />
              <Label htmlFor={id} className='flex flex-1 cursor-pointer items-center gap-2'>
                <span className='font-medium'>{ctx.name}</span>
                {ctx.description && (
                  <span className='text-muted-foreground truncate text-xs'>{ctx.description}</span>
                )}
              </Label>
            </div>
          );
        })}
      </div>
      {createButton}
    </div>
  );
}
