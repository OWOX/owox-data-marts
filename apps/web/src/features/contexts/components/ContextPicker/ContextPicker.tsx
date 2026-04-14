import { useState, useEffect } from 'react';
import { Checkbox } from '@owox/ui/components/checkbox';
import { Label } from '@owox/ui/components/label';
import { Button } from '@owox/ui/components/button';
import { Plus } from 'lucide-react';
import { contextService } from '../../services/context.service';
import type { ContextDto } from '../../types/context.types';

interface ContextPickerProps {
  selectedContextIds: string[];
  onChange: (contextIds: string[]) => void;
  disabled?: boolean;
  idPrefix?: string;
  /**
   * When provided, renders a "Create context" button below the list. The
   * parent wires this to an AddContextSheet and bumps `refreshToken` once
   * the newly created context persists — this component will re-fetch.
   */
  onRequestCreate?: () => void;
  /** Bump this value to force a re-fetch of the contexts list. */
  refreshToken?: number;
}

/**
 * Controlled checkbox list of all project contexts. Each toggle calls
 * `onChange` with the new id list — the parent decides when to persist
 * (typically via a form-wide Save button).
 */
export function ContextPicker({
  selectedContextIds,
  onChange,
  disabled,
  idPrefix = 'ctx-picker',
  onRequestCreate,
  refreshToken,
}: ContextPickerProps) {
  const [allContexts, setAllContexts] = useState<ContextDto[]>([]);

  useEffect(() => {
    void contextService.getContexts().then(setAllContexts);
  }, [refreshToken]);

  const handleToggle = (contextId: string, checked: boolean) => {
    const next = checked
      ? [...selectedContextIds, contextId]
      : selectedContextIds.filter(id => id !== contextId);
    onChange(next);
  };

  const createButton = onRequestCreate ? (
    <Button
      type='button'
      variant='ghost'
      size='sm'
      className='text-muted-foreground hover:text-foreground mt-1 w-fit'
      onClick={onRequestCreate}
      disabled={disabled === true}
    >
      <Plus className='mr-1 h-4 w-4' />
      Create context
    </Button>
  ) : null;

  if (allContexts.length === 0) {
    return (
      <div className='flex flex-col gap-1'>
        <div className='text-muted-foreground py-2 text-sm'>
          {onRequestCreate
            ? 'No contexts yet.'
            : 'No contexts available. Ask your admin to create contexts.'}
        </div>
        {createButton}
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-1'>
      {allContexts.map(ctx => {
        const id = `${idPrefix}-${ctx.id}`;
        const checked = selectedContextIds.includes(ctx.id);
        return (
          <div key={ctx.id} className='hover:bg-muted/50 flex items-center gap-3 rounded-md p-2'>
            <Checkbox
              id={id}
              checked={checked}
              onCheckedChange={val => {
                handleToggle(ctx.id, val === true);
              }}
              disabled={disabled === true}
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
      {createButton}
    </div>
  );
}
