import { ReportFormMode } from '../../shared';

interface UseSaveDisabledParams {
  mode: ReportFormMode;
  isSubmitting: boolean;
  isValid: boolean;
  isDirty: boolean;
  triggersDirty?: boolean;
  ownersDirty?: boolean;
  hasOrphans?: boolean;
}

export function useSaveDisabled({
  mode,
  isSubmitting,
  isValid,
  isDirty,
  triggersDirty = false,
  ownersDirty = false,
  hasOrphans = false,
}: UseSaveDisabledParams): boolean {
  if (isSubmitting || hasOrphans) return true;
  if (mode === ReportFormMode.CREATE) return !isValid;
  return !(isDirty || triggersDirty || ownersDirty);
}
