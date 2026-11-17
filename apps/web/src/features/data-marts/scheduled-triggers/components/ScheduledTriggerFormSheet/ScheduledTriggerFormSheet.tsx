import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@owox/ui/components/sheet';
import { CopyLinkButton } from '@owox/ui/components/common/copy-link-button';
import { ScheduledTriggerForm } from '../ScheduledTriggerForm';
import { useScheduledTriggerContext } from '../../model';
import type { ScheduledTrigger } from '../../model/scheduled-trigger.model';
import type { ScheduledTriggerFormData } from '../../schemas';
import { ScheduledTriggerType, TRIGGER_CONFIG_TYPES } from '../../enums';
import type {
  ScheduledReportRunConfig,
  ScheduledTriggerConfig,
} from '../../model/trigger-config.types';
import { useMemo, useEffect, useRef } from 'react';
import { UnsavedChangesConfirmationDialog } from '../../../../../shared/components/UnsavedChangesConfirmationDialog';
import { trackEvent } from '../../../../../utils';
import { useUnsavedGuard } from '../../../../../hooks/useUnsavedGuard';
import { useIntercomLauncher } from '../../../../../shared/hooks/useIntercomLauncher';

interface ScheduledTriggerFormSheetProps {
  isOpen: boolean;
  onClose: () => void;
  dataMartId: string;
  preSelectedReportId?: string;
  preSelectedType?: ScheduledTriggerType;
  /** The trigger to edit. Without it, the sheet creates one. */
  trigger?: ScheduledTrigger | null;
  /** The page link that opens the trigger in edit mode. */
  link?: string | null;
}

export function ScheduledTriggerFormSheet({
  isOpen,
  onClose,
  dataMartId,
  preSelectedReportId,
  preSelectedType,
  trigger: selectedTrigger,
  link,
}: ScheduledTriggerFormSheetProps) {
  useIntercomLauncher(isOpen);

  const { createScheduledTrigger, updateScheduledTrigger } = useScheduledTriggerContext();

  const {
    showUnsavedDialog,
    setShowUnsavedDialog,
    handleClose,
    confirmClose,
    handleFormDirtyChange,
    handleFormSubmitSuccess,
  } = useUnsavedGuard(onClose);

  const isEditMode = !!selectedTrigger;

  // Convert selectedTrigger to form data format
  // When editing an existing trigger, the type field will be disabled
  // Also, if a report is selected, the trigger type can't be changed
  const initialFormData = useMemo(() => {
    if (!selectedTrigger) return undefined;

    const formData: ScheduledTriggerFormData = {
      type: selectedTrigger.type,
      cronExpression: selectedTrigger.cronExpression,
      timeZone: selectedTrigger.timeZone,
      isActive: selectedTrigger.isActive,
      triggerConfig:
        selectedTrigger.type === ScheduledTriggerType.REPORT_RUN
          ? {
              type: TRIGGER_CONFIG_TYPES.SCHEDULED_REPORT_RUN,
              reportId: (selectedTrigger.triggerConfig as ScheduledReportRunConfig).reportId,
            }
          : null,
    };

    return formData;
  }, [selectedTrigger]);

  const handleSubmit = async (data: ScheduledTriggerFormData) => {
    if (isEditMode) {
      // Update existing trigger
      await updateScheduledTrigger(
        dataMartId,
        selectedTrigger.id,
        data.cronExpression,
        data.timeZone,
        data.isActive
      );
    } else {
      // Create new trigger
      await createScheduledTrigger(
        dataMartId,
        data.type,
        data.cronExpression,
        data.timeZone,
        data.isActive,
        data.triggerConfig as ScheduledTriggerConfig
      );
    }
    handleFormSubmitSuccess();
  };

  const wasOpenRef = useRef<boolean>(false);
  useEffect(() => {
    const mode = isEditMode ? 'Edit' : 'Create';
    const triggerType = selectedTrigger?.type ?? preSelectedType;
    if (isOpen && !wasOpenRef.current) {
      trackEvent({
        event: 'scheduled_trigger_config_open',
        category: 'ScheduledTrigger',
        action: mode,
        label: triggerType,
      });
      wasOpenRef.current = true;
    } else if (!isOpen && wasOpenRef.current) {
      trackEvent({
        event: 'scheduled_trigger_config_close',
        category: 'ScheduledTrigger',
        action: mode,
        label: triggerType,
      });
      wasOpenRef.current = false;
    }
  }, [isOpen, isEditMode, selectedTrigger, preSelectedType]);

  return (
    <Sheet
      open={isOpen}
      onOpenChange={open => {
        if (!open) {
          handleClose();
        }
      }}
    >
      <SheetContent data-testid='triggerEditSheet'>
        <SheetHeader>
          <SheetTitle>{isEditMode ? 'Edit' : 'Create'} Scheduled Trigger</SheetTitle>
          <div className='flex w-full items-center gap-4'>
            <SheetDescription>
              Configure automatic runs for reports, connectors, or Data Quality checks.
            </SheetDescription>
            {isEditMode && link && (
              <CopyLinkButton link={link} ariaLabel='Copy link to this trigger' />
            )}
          </div>
        </SheetHeader>
        <ScheduledTriggerForm
          preSelectedReportId={preSelectedReportId}
          preSelectedType={preSelectedType}
          initialData={initialFormData}
          onSubmit={handleSubmit}
          onCancel={handleClose}
          onDirtyChange={handleFormDirtyChange}
        />
        <UnsavedChangesConfirmationDialog
          open={showUnsavedDialog}
          onOpenChange={setShowUnsavedDialog}
          onConfirm={confirmClose}
        />
      </SheetContent>
    </Sheet>
  );
}
