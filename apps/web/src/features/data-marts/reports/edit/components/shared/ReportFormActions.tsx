import { FormActions } from '@owox/ui/components/form';
import { Button } from '@owox/ui/components/button';
import { DropdownMenuItem } from '@owox/ui/components/dropdown-menu';
import { ReportFormMode } from '../../../shared';
import { SplitButton } from '../../../../../../shared/components/SplitButton';
import { useRef, useEffect } from 'react';
import type { RefObject } from 'react';

export interface ReportFormActionsProps {
  mode: ReportFormMode;
  isSubmitting: boolean;
  isDirty: boolean;
  triggersDirty: boolean;
  ownersDirty?: boolean;
  runAfterSaveRef: RefObject<boolean>;
  /**
   * False where the server has no run to start — a pull destination reads the report itself.
   * The run half of every action disappears rather than being offered and refused.
   */
  canRunAfterSave?: boolean;
  /**
   * A change the picker made on its own initiative that the report has not stored yet — today,
   * the automatic aggregation it fills in on open. It is not an edit, so it never reaches
   * `isDirty`; it still has to be savable, or the rule the editor shows never reaches the server.
   */
  hasPendingRepair?: boolean;
  onSubmit: () => void;
  onCancel?: () => void;
}

export const ReportFormActions = ({
  mode,
  isSubmitting,
  isDirty,
  triggersDirty,
  ownersDirty = false,
  runAfterSaveRef,
  canRunAfterSave = true,
  hasPendingRepair = false,
  onSubmit,
  onCancel,
}: ReportFormActionsProps) => {
  // Guards against double-submit during the window between the first click and
  // the parent updating isSubmitting to true (async resolver latency).
  const submitPendingRef = useRef(false);
  useEffect(() => {
    if (!isSubmitting) {
      submitPendingRef.current = false;
    }
  }, [isSubmitting]);

  // In CREATE mode the button stays clickable even while the form is invalid:
  // submitting runs validation, which opens collapsed sections with errors and
  // focuses the first invalid field. Disabling on !isValid would leave the user
  // with no hint about what is missing.
  const hasSomethingToSave = isDirty || triggersDirty || ownersDirty || hasPendingRepair;
  const disabledPrimary = isSubmitting || (mode === ReportFormMode.EDIT && !hasSomethingToSave);

  const primaryLabel =
    mode === ReportFormMode.CREATE
      ? canRunAfterSave
        ? 'Create & Run report'
        : 'Create report'
      : 'Save changes to report';

  const dropdownItemLabel =
    mode === ReportFormMode.CREATE
      ? 'Create new report'
      : hasSomethingToSave
        ? 'Save & Run report'
        : 'Run report';

  return (
    <FormActions>
      <SplitButton
        groupClassName='w-full'
        type='submit'
        disabled={disabledPrimary}
        className='flex-1'
        onClick={e => {
          if (submitPendingRef.current) {
            e.preventDefault();
            return;
          }
          submitPendingRef.current = true;
          // For CREATE: run after save. For EDIT: don't run
          runAfterSaveRef.current = canRunAfterSave && mode === ReportFormMode.CREATE;
        }}
        // Every entry in this menu is a variation on running the report, so with no
        // server-side run there is nothing left to offer.
        menu={
          canRunAfterSave && (
            <DropdownMenuItem
              onClick={() => {
                if (submitPendingRef.current || isSubmitting) return;
                submitPendingRef.current = true;
                // For CREATE: don't run. For EDIT: run after save
                runAfterSaveRef.current = mode === ReportFormMode.EDIT;
                onSubmit();
              }}
              disabled={isSubmitting}
            >
              {dropdownItemLabel}
            </DropdownMenuItem>
          )
        }
      >
        {primaryLabel}
      </SplitButton>

      {onCancel && (
        <Button variant='outline' type='button' onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
      )}
    </FormActions>
  );
};
