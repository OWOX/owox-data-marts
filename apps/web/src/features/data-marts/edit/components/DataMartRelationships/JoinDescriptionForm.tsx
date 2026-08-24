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

interface JoinDescriptionOverride {
  /** The stored per-join override for this node; '' when the join inherits. */
  value: string;
  /** Persists the override. An all-whitespace value clears it back to inherited. */
  onChange: (description: string) => void;
}

interface JoinDescriptionFormProps {
  relationship: DataMartRelationship;
  dataMartId: string;
  readOnly?: boolean;
  /**
   * When set, the join is inherited from a parent data mart and must be edited there.
   * Renders an informational banner with a link to the parent.
   */
  inheritedFrom?: { id: string; title: string } | null;
  /**
   * When set, the form edits a PER-JOIN description override instead of the relationship's own
   * description: the relationship-level text stays the inherited default and is shown as the
   * placeholder, while anything typed here applies to this join node only.
   */
  override?: JoinDescriptionOverride;
  onSaved: (updated: DataMartRelationship) => void;
}

const DESCRIPTION_TOOLTIP =
  'Optional business meaning of this relationship. AI assistants read it through MCP to ' +
  'understand how the joined data relates — not just how the rows are matched.';

const DESCRIPTION_PLACEHOLDER =
  'e.g. Visitors from the website sign up for the product and convert into users';

function DescriptionLabel() {
  return (
    <label className='flex items-center gap-1.5 text-sm font-medium'>
      Relationship Description
      <Tooltip>
        <TooltipTrigger asChild>
          <span className='text-muted-foreground/50 hover:text-muted-foreground shrink-0 transition-colors'>
            <Info className='size-4 shrink-0' />
          </span>
        </TooltipTrigger>
        <TooltipContent side='top' className='max-w-xs'>
          {DESCRIPTION_TOOLTIP}
        </TooltipContent>
      </Tooltip>
    </label>
  );
}

/**
 * Editor for the per-join description override. The commit is a synchronous callback into the
 * blended-fields-config save path (optimistic local state, whole-config PUT), so unlike the
 * relationship PATCH below it needs no in-flight serialization — only debounce and flushes.
 */
function OverrideDescriptionEditor({
  inheritedDescription,
  inheritedFrom,
  override,
}: {
  inheritedDescription: string;
  inheritedFrom: { id: string; title: string } | null;
  override: JoinDescriptionOverride;
}) {
  const { scope } = useProjectRoute();

  const savedValue = override.value;
  const [localValue, setLocalValue] = useState(savedValue);
  const debouncedValue = useDebounce(localValue, 800);
  const isDirtyRef = useRef(false);
  const latestValueRef = useRef(savedValue);
  const lastSavedRef = useRef(savedValue);

  useEffect(() => {
    lastSavedRef.current = savedValue;
    // Sync from the config only while clean — resetting mid-edit would revert typed text.
    if (!isDirtyRef.current) {
      setLocalValue(savedValue);
      latestValueRef.current = savedValue;
    }
  }, [savedValue]);

  const commitRef = useRef<(value: string) => void>(() => {
    /* replaced each render below */
  });
  commitRef.current = value => {
    if (value.trim() === lastSavedRef.current.trim()) {
      isDirtyRef.current = false;
      return;
    }
    lastSavedRef.current = value;
    isDirtyRef.current = false;
    override.onChange(value);
  };

  useEffect(() => {
    if (!isDirtyRef.current) return;
    commitRef.current(latestValueRef.current);
  }, [debouncedValue]);

  // Flush a pending edit when the tab unmounts (tab switch, row collapse) — the debounce
  // timer dies with the component, and blur is not guaranteed to fire first.
  useEffect(() => {
    return () => {
      if (isDirtyRef.current) {
        commitRef.current(latestValueRef.current);
      }
    };
  }, []);

  const hasInherited = inheritedDescription.trim() !== '';
  const hasOverride = localValue.trim() !== '';

  return (
    <div className='flex flex-col gap-3 p-4'>
      {inheritedFrom && (
        <div className='flex min-w-0 items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200'>
          <Info className='size-4 shrink-0' />
          <p className='min-w-0 flex-1 truncate leading-snug'>
            Inherited from <span className='font-semibold'>{inheritedFrom.title}</span> — typing
            here overrides the description for this join only.
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

      <DescriptionLabel />

      <Textarea
        value={localValue}
        onChange={e => {
          setLocalValue(e.target.value);
          latestValueRef.current = e.target.value;
          isDirtyRef.current = true;
        }}
        onBlur={() => {
          if (isDirtyRef.current) {
            commitRef.current(latestValueRef.current);
          }
        }}
        placeholder={hasInherited ? inheritedDescription : DESCRIPTION_PLACEHOLDER}
        rows={4}
        className='bg-background text-sm dark:bg-white/5'
      />

      {hasOverride && hasInherited && (
        <div>
          <Button
            type='button'
            variant='ghost'
            size='sm'
            className='h-7 text-xs'
            onClick={() => {
              setLocalValue('');
              latestValueRef.current = '';
              isDirtyRef.current = true;
              commitRef.current('');
            }}
          >
            Reset to inherited
          </Button>
        </div>
      )}
    </div>
  );
}

export function JoinDescriptionForm({
  relationship,
  dataMartId,
  readOnly = false,
  inheritedFrom,
  override,
  onSaved,
}: JoinDescriptionFormProps) {
  // Distinct child components, not an inline branch: the editors hold different hook sets, and
  // `override` can appear after mount (once the source entry loads), which would otherwise
  // change the hook order within one component instance.
  if (override && !readOnly) {
    return (
      <OverrideDescriptionEditor
        inheritedDescription={relationship.description ?? ''}
        inheritedFrom={inheritedFrom ?? null}
        override={override}
      />
    );
  }
  return (
    <RelationshipDescriptionEditor
      relationship={relationship}
      dataMartId={dataMartId}
      readOnly={readOnly}
      inheritedFrom={inheritedFrom}
      onSaved={onSaved}
    />
  );
}

function RelationshipDescriptionEditor({
  relationship,
  dataMartId,
  readOnly = false,
  inheritedFrom,
  onSaved,
}: Omit<JoinDescriptionFormProps, 'override'>) {
  const { scope } = useProjectRoute();

  const savedValue = relationship.description ?? '';
  const [localValue, setLocalValue] = useState(savedValue);
  const debouncedValue = useDebounce(localValue, 800);
  const [isSaving, setIsSaving] = useState(false);
  const lastSavedRef = useRef(savedValue);
  // What the textarea holds RIGHT NOW — the debounced value and the in-flight payload
  // both lag behind it, and every dirty/clean decision must compare against it.
  const latestValueRef = useRef(savedValue);
  const isDirtyRef = useRef(false);

  useEffect(() => {
    lastSavedRef.current = savedValue;
    // Sync from the server only while clean — resetting mid-edit would silently
    // revert text the user typed while a save was in flight.
    if (!isDirtyRef.current) {
      setLocalValue(savedValue);
      latestValueRef.current = savedValue;
    }
  }, [savedValue]);

  // The settled-or-null promise of the PATCH currently on the wire. Only one PATCH may
  // be in flight at a time — the server has no version check, so two concurrent PATCHes
  // can apply out of order and the stale one would win.
  const inFlightRef = useRef<Promise<void> | null>(null);

  // Kept in refs so effects and the unmount cleanup can call the latest logic without
  // depending on a new function identity every render.
  const sendRef = useRef<(value: string) => void>(() => {
    /* replaced each render below */
  });
  sendRef.current = value => {
    if (readOnly) return;
    if (value.trim() === lastSavedRef.current.trim()) {
      // Nothing to send; stay dirty only if the textarea has since diverged again.
      isDirtyRef.current = latestValueRef.current.trim() !== lastSavedRef.current.trim();
      return;
    }
    setIsSaving(true);
    const request = dataMartRelationshipService
      .updateRelationship(
        dataMartId,
        relationship.id,
        // An all-whitespace description is a cleared one: send null so the backend stores NULL.
        { description: value.trim() === '' ? null : value },
        { skipErrorToast: true, skipLoadingIndicator: true }
      )
      .then(updated => {
        lastSavedRef.current = updated.description ?? '';
        // Clear the dirty flag only if the textarea still matches what was sent —
        // text typed during the request stays dirty and is retried below.
        if (latestValueRef.current.trim() === value.trim()) {
          isDirtyRef.current = false;
        }
        onSaved(updated);
      })
      .catch(() => {
        toast.error('Failed to save relationship description', {
          id: `join-description-save-error-${relationship.id}`,
        });
      })
      .finally(() => {
        setIsSaving(false);
        if (inFlightRef.current === request) {
          inFlightRef.current = null;
        }
      });
    inFlightRef.current = request;
  };

  const saveRef = useRef<(value: string) => void>(() => {
    /* replaced each render below */
  });
  saveRef.current = value => {
    if (isSaving) return;
    sendRef.current(value);
  };

  // Fires when the debounce settles AND whenever an in-flight save finishes —
  // the latter retries edits that were skipped because a save was already running.
  useEffect(() => {
    if (!isDirtyRef.current || isSaving) return;
    saveRef.current(latestValueRef.current);
  }, [debouncedValue, isSaving]);

  // Flush a pending edit when the tab unmounts (tab switch, row collapse) — the
  // debounce timer dies with the component, and blur is not guaranteed to fire first.
  // Queued BEHIND any in-flight save, never alongside it: the flush must not start a
  // second PATCH that could be processed before the first and lose to its stale text.
  useEffect(() => {
    return () => {
      if (!isDirtyRef.current) return;
      const flushPending = () => {
        // Re-checked after the in-flight save settles — it may have covered this edit.
        if (isDirtyRef.current) {
          sendRef.current(latestValueRef.current);
        }
      };
      if (inFlightRef.current) {
        void inFlightRef.current.then(flushPending);
      } else {
        flushPending();
      }
    };
  }, []);

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

      <DescriptionLabel />

      <Textarea
        value={localValue}
        onChange={e => {
          setLocalValue(e.target.value);
          latestValueRef.current = e.target.value;
          isDirtyRef.current = true;
        }}
        onBlur={() => {
          if (isDirtyRef.current && !isSaving) {
            saveRef.current(latestValueRef.current);
          }
        }}
        placeholder={DESCRIPTION_PLACEHOLDER}
        disabled={readOnly}
        rows={4}
        className='bg-background text-sm dark:bg-white/5'
      />
    </div>
  );
}
