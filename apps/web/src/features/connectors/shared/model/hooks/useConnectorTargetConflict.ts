import { useEffect, useState } from 'react';
import { dataMartService } from '../../../../data-marts/shared/services/data-mart.service';
import type { ConnectorTargetConflictResponseDto } from '../../../../data-marts/shared/types/api/response/connector-target-conflict.response.dto';

const DEBOUNCE_MS = 400;

/** Looks up, after typing settles, whether another Data Mart writes the same target table. */
export function useConnectorTargetConflict(
  dataMartId: string | undefined,
  target: { fullyQualifiedName: string; isValid: boolean } | null
): ConnectorTargetConflictResponseDto | null {
  const [answer, setAnswer] = useState<ConnectorTargetConflictResponseDto | null>(null);
  const fqn = target?.isValid && dataMartId ? target.fullyQualifiedName : '';

  useEffect(() => {
    setAnswer(null);
    if (!fqn || !dataMartId) return;
    let stale = false;
    const timer = setTimeout(() => {
      dataMartService
        .getConnectorTargetConflict(dataMartId, fqn)
        .then(result => {
          if (!stale) setAnswer(result);
        })
        .catch(() => {
          // The warning is advisory: a failed lookup shows nothing.
        });
    }, DEBOUNCE_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [dataMartId, fqn]);

  return answer;
}
