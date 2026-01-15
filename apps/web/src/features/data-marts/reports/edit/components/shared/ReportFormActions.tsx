import { FormActions } from '@owox/ui/components/form';
import { Button } from '@owox/ui/components/button';
import { ButtonGroup } from '@owox/ui/components/button-group';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { ChevronDown } from 'lucide-react';
import { ReportFormMode } from '../../../shared';
import type { RefObject } from 'react';

export interface ReportFormActionsProps {
  mode: ReportFormMode;
  isSubmitting: boolean;
  isDirty: boolean;
  triggersDirty: boolean;
  runAfterSaveRef: RefObject<boolean>;
  onSubmit: () => void;
  onCancel?: () => void;
}

export const ReportFormActions = ({
  mode,
  isSubmitting,
  isDirty,
  triggersDirty,
  runAfterSaveRef,
  onSubmit,
  onCancel,
}: ReportFormActionsProps) => {
  const disabledPrimary = isSubmitting || !(isDirty || triggersDirty);

  const primaryLabel =
    mode === ReportFormMode.CREATE ? 'Create & Run report' : 'Save changes to report';

  const dropdownItemLabel =
    mode === ReportFormMode.CREATE
      ? 'Create new report'
      : isDirty || triggersDirty
        ? 'Save & Run report'
        : 'Run report';

  return (
    <FormActions>
      <ButtonGroup className='w-full'>
        <Button
          variant='default'
          type='submit'
          disabled={disabledPrimary}
          className='flex-1'
          onClick={() => {
            // For CREATE: run after save. For EDIT: don't run
            runAfterSaveRef.current = mode === ReportFormMode.CREATE;
          }}
        >
          {primaryLabel}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant='default'
              type='button'
              disabled={disabledPrimary}
              aria-label='More actions'
              className='group'
            >
              <ChevronDown
                className='size-4 transition-transform duration-200 group-data-[state=open]:rotate-180'
                aria-hidden='true'
              />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end' side='top'>
            <DropdownMenuItem
              onClick={() => {
                // For CREATE: don't run. For EDIT: run after save
                runAfterSaveRef.current = mode === ReportFormMode.EDIT;
                onSubmit();
              }}
              disabled={isSubmitting}
            >
              {dropdownItemLabel}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ButtonGroup>

      {onCancel && (
        <Button variant='outline' type='button' onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
      )}
    </FormActions>
  );
};
