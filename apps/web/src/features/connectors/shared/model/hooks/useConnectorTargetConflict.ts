import { useEffect, useState } from 'react';
import { dataMartService } from '../../../../data-marts/shared/services/data-mart.service';
import type { ConnectorTargetConflictResponseDto } from '../../../../data-marts/shared/types/api/response/connector-target-conflict.response.dto';

const DEBOUNCE_MS = 400;

/** Looks up, after typing settles, whether another Data Mart writes the same target table. */
export function useConnectorTargetConflict(
  dataMartId: string | undefined,
  target: { fullyQualifiedName: string; isValid: boolean } | null
): { conflict: ConnectorTargetConflictResponseDto | null; isPending: boolean } {
  // The answer records its target, so a changed target is pending at once, with no stale answer.
  const [stored, setStored] = useState<{
    fqn: string;
    answer: ConnectorTargetConflictResponseDto | null;
  }>({ fqn: '', answer: null });
  const fqn = target?.isValid && dataMartId ? target.fullyQualifiedName : '';

  useEffect(() => {
    if (!fqn || !dataMartId) return;
    let stale = false;
    const timer = setTimeout(() => {
      dataMartService
        .getConnectorTargetConflict(dataMartId, fqn)
        .then(result => {
          if (!stale) setStored({ fqn, answer: result });
        })
        .catch(() => {
          // The warning is advisory: a failed lookup counts as answered with no conflict.
          if (!stale) setStored({ fqn, answer: null });
        });
    }, DEBOUNCE_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [dataMartId, fqn]);

  const answered = stored.fqn === fqn;
  return { conflict: answered ? stored.answer : null, isPending: fqn !== '' && !answered };
}
