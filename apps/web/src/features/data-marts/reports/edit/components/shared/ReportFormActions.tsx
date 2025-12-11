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

export interface ReportFormActionsProps {
  mode: ReportFormMode;
  isSubmitting: boolean;
  isDirty: boolean;
  triggersDirty: boolean;
  onRunAndSave: () => void;
  onCancel?: () => void;
}

export const ReportFormActions = ({
  mode,
  isSubmitting,
  isDirty,
  triggersDirty,
  onRunAndSave,
  onCancel,
}: ReportFormActionsProps) => {
  const disabledPrimary = isSubmitting || !(isDirty || triggersDirty);
  const dropdownItemLabel =
    mode === ReportFormMode.CREATE
      ? 'Create & Run report'
      : isDirty || triggersDirty
        ? 'Save & Run report'
        : 'Run report';

  return (
    <FormActions>
      <ButtonGroup className='w-full'>
        <Button variant='default' type='submit' disabled={disabledPrimary} className='flex-1'>
          {mode === ReportFormMode.CREATE ? 'Create new report' : 'Save changes to report'}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant='default'
              type='button'
              disabled={disabledPrimary}
              aria-label='More actions'
            >
              <ChevronDown className='size-4' aria-hidden='true' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='start'>
            <DropdownMenuItem onClick={onRunAndSave} disabled={isSubmitting}>
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
