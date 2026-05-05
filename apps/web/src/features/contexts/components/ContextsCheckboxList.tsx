import type { ReactNode } from 'react';
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
  emptyText?: ReactNode;
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
    <Button type='button' variant='outline' size='sm' onClick={onRequestCreate} disabled={disabled}>
      <Plus className='size-4' />
      New context
    </Button>
  ) : null;

  if (contexts.length === 0) {
    const fallback = onRequestCreate
      ? 'No contexts yet.'
      : 'No contexts available. Create one in the Contexts tab.';
    return (
      <div className='flex flex-col gap-1'>
        <div className='border-border flex flex-col gap-2 rounded-md border px-4 py-8'>
          <div className='text-muted-foreground text-center text-sm'>{emptyText ?? fallback}</div>
          <div className='flex justify-center'>{createButton}</div>
        </div>
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-1'>
      <div className='border-input flex flex-col gap-1 rounded-md border p-2'>
        {contexts.map(ctx => {
          const checked = selectedIds.includes(ctx.id);
          const id = `${idPrefix}-${ctx.id}`;
          return (
            <div
              key={ctx.id}
              className='hover:bg-muted dark:hover:bg-muted/50 flex items-center gap-3 rounded-md px-3 py-2'
            >
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
