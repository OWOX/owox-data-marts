import { useCallback, useState } from 'react';
import type { OutputConfigRepairOptions } from '../../../shared/types/output-config';

/**
 * Whether the picker has filled an automatic aggregation into the form that the report has not
 * stored yet.
 *
 * The fill-in is emitted as a repair, which moves the baseline instead of dirtying the form — so a
 * report opened and not otherwise touched would show the rule ticked, counted and listed with
 * **Save** greyed out, and the rule the editor promises to save would never reach the server.
 *
 * Deliberately NOT part of `onDirtyChange`: the analyst has no unsaved edits, so the leave guard
 * must stay quiet. It only keeps the button reachable, the way the add-in's `hasPendingRepair`
 * does — the two hosts of one feature have to persist the same way.
 */
export function usePendingAutoAggregation() {
  const [pendingAutoAggregation, setPending] = useState(false);

  const noteOutputConfigChange = useCallback((options?: OutputConfigRepairOptions) => {
    if (options?.isRepair && options.changed.includes('aggregationConfig')) {
      setPending(true);
    }
  }, []);

  const clearPendingAutoAggregation = useCallback(() => {
    setPending(false);
  }, []);

  return { pendingAutoAggregation, noteOutputConfigChange, clearPendingAutoAggregation };
}
