import { useState, useEffect } from 'react';
import { contextService } from '../../services/context.service';
import { AdminsHoverCard } from '../../../project-members/components/AdminsHoverCard';
import type { ContextDto } from '../../types/context.types';
import { ContextsCheckboxList } from '../ContextsCheckboxList';

interface ContextPickerProps {
  selectedContextIds: string[];
  onChange: (contextIds: string[]) => void;
  disabled?: boolean;
  idPrefix?: string;
  onRequestCreate?: () => void;
  refreshToken?: number;
}

/**
 * Self-fetching wrapper around ContextsCheckboxList: loads all project
 * contexts on mount and on `refreshToken` change, then forwards toggle
 * events to the parent. The leaf rendering lives in ContextsCheckboxList
 * so the two components do not drift on row layout / empty-state copy.
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
    let cancelled = false;
    void contextService.getContexts().then(list => {
      if (!cancelled) setAllContexts(list);
    });
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  const handleToggle = (contextId: string, checked: boolean) => {
    const next = checked
      ? [...selectedContextIds, contextId]
      : selectedContextIds.filter(id => id !== contextId);
    onChange(next);
  };

  const adminWord = (
    <AdminsHoverCard>
      <span className='cursor-help underline decoration-dotted underline-offset-2'>admin</span>
    </AdminsHoverCard>
  );

  return (
    <ContextsCheckboxList
      idPrefix={idPrefix}
      contexts={allContexts}
      selectedIds={selectedContextIds}
      onToggle={handleToggle}
      disabled={disabled}
      onRequestCreate={onRequestCreate}
      emptyText={
        onRequestCreate ? undefined : (
          <>No contexts available. Ask your {adminWord} to create contexts.</>
        )
      }
    />
  );
}
