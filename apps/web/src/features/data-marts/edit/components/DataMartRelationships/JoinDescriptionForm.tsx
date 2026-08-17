import { Textarea } from '@owox/ui/components/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { ExternalLink, Info } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Button } from '../../../../../shared/components/Button';
import { useProjectRoute } from '../../../../../shared/hooks/useProjectRoute';
import { useDebounce } from '../../../../../hooks/useDebounce';
import { dataMartRelationshipService } from '../../../shared/services/data-mart-relationship.service';
import type { DataMartRelationship } from '../../../shared/types/relationship.types';

interface JoinDescriptionFormProps {
  relationship: DataMartRelationship;
  dataMartId: string;
  readOnly?: boolean;
  /**
   * When set, the join is inherited from a parent data mart and must be edited there.
   * Renders an informational banner with a link to the parent.
   */
  inheritedFrom?: { id: string; title: string } | null;
  onSaved: (updated: DataMartRelationship) => void;
}

export function JoinDescriptionForm({
  relationship,
  dataMartId,
  readOnly = false,
  inheritedFrom,
  onSaved,
}: JoinDescriptionFormProps) {
  const { scope } = useProjectRoute();

  const savedValue = relationship.description ?? '';
  const [localValue, setLocalValue] = useState(savedValue);
  const debouncedValue = useDebounce(localValue, 800);
  const lastSavedRef = useRef(savedValue);
  const isDirtyRef = useRef(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setLocalValue(savedValue);
    lastSavedRef.current = savedValue;
    isDirtyRef.current = false;
  }, [savedValue]);

  const save = (value: string) => {
    if (readOnly || isSaving) return;
    if (value.trim() === lastSavedRef.current.trim()) {
      isDirtyRef.current = false;
      return;
    }
    setIsSaving(true);
    dataMartRelationshipService
      .updateRelationship(
        dataMartId,
        relationship.id,
        // An all-whitespace description is a cleared one: send null so the backend stores NULL.
        { description: value.trim() === '' ? null : value },
        { skipErrorToast: true, skipLoadingIndicator: true }
      )
      .then(updated => {
        lastSavedRef.current = updated.description ?? '';
        isDirtyRef.current = false;
        onSaved(updated);
      })
      .catch(() => {
        toast.error('Failed to save relationship description', {
          id: `join-description-save-error-${relationship.id}`,
        });
      })
      .finally(() => {
        setIsSaving(false);
      });
  };

  useEffect(() => {
    if (!isDirtyRef.current) return;
    save(debouncedValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run only when the debounced value settles
  }, [debouncedValue]);

  return (
    <div className='flex flex-col gap-3 p-4'>
      {inheritedFrom && (
        <div className='flex min-w-0 items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200'>
          <Info className='size-4 shrink-0' />
          <p className='min-w-0 flex-1 truncate leading-snug'>
            Inherited from <span className='font-semibold'>{inheritedFrom.title}</span> — edit the
            description there.
          </p>
          <Button
            type='button'
            variant='outline'
            size='sm'
            className='h-7 shrink-0 bg-white/80 text-xs dark:bg-white/5'
            onClick={() => {
              window.open(scope(`/data-marts/${inheritedFrom.id}/data-setup`), '_blank');
            }}
          >
            <ExternalLink className='size-3.5' />
            <span className='max-w-[200px] truncate'>Open {inheritedFrom.title}</span>
          </Button>
        </div>
      )}

      <label className='flex items-center gap-1.5 text-sm font-medium'>
        Relationship Description
        <Tooltip>
          <TooltipTrigger asChild>
            <span className='text-muted-foreground/50 hover:text-muted-foreground shrink-0 transition-colors'>
              <Info className='size-4 shrink-0' />
            </span>
          </TooltipTrigger>
          <TooltipContent side='top' className='max-w-xs'>
            Optional business meaning of this relationship. AI assistants read it through MCP to
            understand how the joined data relates — not just how the rows are matched.
          </TooltipContent>
        </Tooltip>
      </label>

      <Textarea
        value={localValue}
        onChange={e => {
          setLocalValue(e.target.value);
          isDirtyRef.current = true;
        }}
        onBlur={() => {
          if (isDirtyRef.current) save(localValue);
        }}
        placeholder='e.g. Visitors from the website sign up for the product and convert into users'
        disabled={readOnly}
        rows={4}
        className='bg-background text-sm dark:bg-white/5'
      />
    </div>
  );
}
