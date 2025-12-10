import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@owox/ui/components/sheet';
import { ScheduledTriggerForm } from '../ScheduledTriggerForm';
import { useScheduledTriggerContext } from '../../model';
import type { ScheduledTriggerFormData } from '../../schemas';
import { ScheduledTriggerType, TRIGGER_CONFIG_TYPES } from '../../enums';
import type {
  ScheduledReportRunConfig,
  ScheduledTriggerConfig,
} from '../../model/trigger-config.types';
import { useMemo, useEffect, useRef } from 'react';
import { ConfirmationDialog } from '../../../../../shared/components/ConfirmationDialog';
import { trackEvent } from '../../../../../utils';
import { useUnsavedGuard } from '../../../../../hooks/useUnsavedGuard';

interface ScheduledTriggerFormSheetProps {
  isOpen: boolean;
  onClose: () => void;
  dataMartId: string;
  preSelectedReportId?: string;
  preSelectedType?: ScheduledTriggerType;
}

export function ScheduledTriggerFormSheet({
  isOpen,
  onClose,
  dataMartId,
  preSelectedReportId,
  preSelectedType,
}: ScheduledTriggerFormSheetProps) {
  useEffect(() => {
    if (isOpen) {
      raiseIntercomLauncher(0, 600);
    } else {
      resetIntercomLauncher();
    }
    return () => {
      resetIntercomLauncher();
    };
  }, [isOpen]);

  const { createScheduledTrigger, updateScheduledTrigger, selectedTrigger } =
    useScheduledTriggerContext();

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
    <>
      <Sheet
        open={isOpen}
        onOpenChange={open => {
          if (!open) {
            handleClose();
          }
        }}
      >
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{isEditMode ? 'Edit' : 'Create'} Scheduled Trigger</SheetTitle>
            <SheetDescription>
              Configure automatic runs for your reports or connectors.
            </SheetDescription>
          </SheetHeader>
          <ScheduledTriggerForm
            preSelectedReportId={preSelectedReportId}
            preSelectedType={preSelectedType}
            initialData={initialFormData}
            onSubmit={handleSubmit}
            onCancel={handleClose}
            onDirtyChange={handleFormDirtyChange}
          />
        </SheetContent>
      </Sheet>

      <ConfirmationDialog
        open={showUnsavedDialog}
        onOpenChange={setShowUnsavedDialog}
        title='Unsaved Changes'
        description='You have unsaved changes. Exit without saving?'
        confirmLabel='Yes, leave now'
        cancelLabel='No, stay here'
        onConfirm={confirmClose}
        variant='destructive'
      />
    </>
  );
}
