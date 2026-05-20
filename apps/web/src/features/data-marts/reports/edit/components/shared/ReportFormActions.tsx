import { FormActions } from '@owox/ui/components/form';
import { Button } from '@owox/ui/components/button';
import { ButtonGroup } from '@owox/ui/components/button-group';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { ChevronDown } from 'lucide-react';
import { ReportFormMode } from '../../../shared';
import type { RefObject } from 'react';
import { useSaveDisabled } from '../../hooks/useSaveDisabled';

export interface ReportFormActionsProps {
  mode: ReportFormMode;
  isSubmitting: boolean;
  isDirty: boolean;
  isValid: boolean;
  triggersDirty: boolean;
  ownersDirty?: boolean;
  hasOrphans?: boolean;
  runAfterSaveRef: RefObject<boolean>;
  onSubmit: () => void;
  onCancel?: () => void;
}

export const ReportFormActions = ({
  mode,
  isSubmitting,
  isDirty,
  isValid,
  triggersDirty,
  ownersDirty = false,
  hasOrphans = false,
  runAfterSaveRef,
  onSubmit,
  onCancel,
}: ReportFormActionsProps) => {
  const disabledPrimary = useSaveDisabled({
    mode,
    isSubmitting,
    isValid,
    isDirty,
    triggersDirty,
    ownersDirty,
    hasOrphans,
  });

  const primaryLabel =
    mode === ReportFormMode.CREATE ? 'Create & Run report' : 'Save changes to report';

  const dropdownItemLabel =
    mode === ReportFormMode.CREATE
      ? 'Create new report'
      : isDirty || triggersDirty || ownersDirty
        ? 'Save & Run report'
        : 'Run report';

  return (
    <FormActions>
      <ButtonGroup className='w-full'>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className='flex-1'>
              <Button
                variant='default'
                type='submit'
                disabled={disabledPrimary}
                className='w-full'
                onClick={() => {
                  runAfterSaveRef.current = mode === ReportFormMode.CREATE;
                }}
              >
                {primaryLabel}
              </Button>
            </span>
          </TooltipTrigger>
          {hasOrphans && <TooltipContent>Remove inaccessible columns before saving</TooltipContent>}
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <span>
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
                      runAfterSaveRef.current = mode === ReportFormMode.EDIT;
                      onSubmit();
                    }}
                    disabled={isSubmitting}
                  >
                    {dropdownItemLabel}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </span>
          </TooltipTrigger>
          {hasOrphans && <TooltipContent>Remove inaccessible columns before saving</TooltipContent>}
        </Tooltip>
      </ButtonGroup>

      {onCancel && (
        <Button variant='outline' type='button' onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
      )}
    </FormActions>
  );
};
