import { useCallback, useMemo } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@owox/ui/components/sheet';
import { ConfirmationDialog } from '../../../shared/components/ConfirmationDialog';
import { useUnsavedGuard } from '../../../hooks/useUnsavedGuard';
import { useIntercomLauncher } from '../../../shared/hooks/useIntercomLauncher';
import { DataMartContext } from '../../../features/data-marts/edit/model/context/context';
import { ScheduledTriggerForm } from '../../../features/data-marts/scheduled-triggers/components/ScheduledTriggerForm';
import {
  ScheduledTriggerType,
  TRIGGER_CONFIG_TYPES,
} from '../../../features/data-marts/scheduled-triggers/enums';
import type { ProjectScheduledTrigger } from '../../../features/data-marts/scheduled-triggers/model/scheduled-trigger.model';
import type { ScheduledReportRunConfig } from '../../../features/data-marts/scheduled-triggers/model/trigger-config.types';
import type { ScheduledTriggerFormData } from '../../../features/data-marts/scheduled-triggers/schemas';
import { scheduledTriggerService } from '../../../features/data-marts/scheduled-triggers/services';
import { buildProjectDataMartContextValue } from '../shared/projectDataMartContext';

interface ProjectScheduledTriggerEditSheetProps {
  trigger: ProjectScheduledTrigger | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => Promise<void> | void;
}

export function ProjectScheduledTriggerEditSheet({
  trigger,
  isOpen,
  onClose,
  onSaved,
}: ProjectScheduledTriggerEditSheetProps) {
  useIntercomLauncher(isOpen);

  const {
    showUnsavedDialog,
    setShowUnsavedDialog,
    handleClose,
    confirmClose,
    handleFormDirtyChange,
    handleFormSubmitSuccess,
  } = useUnsavedGuard(onClose);

  const initialFormData = useMemo<ScheduledTriggerFormData | undefined>(() => {
    if (!trigger) return undefined;

    return {
      type: trigger.type,
      cronExpression: trigger.cronExpression,
      timeZone: trigger.timeZone,
      isActive: trigger.isActive,
      triggerConfig:
        trigger.type === ScheduledTriggerType.REPORT_RUN
          ? {
              type: TRIGGER_CONFIG_TYPES.SCHEDULED_REPORT_RUN,
              reportId: (trigger.triggerConfig as ScheduledReportRunConfig).reportId,
            }
          : null,
    };
  }, [trigger]);

  const dataMartContextValue = useMemo(() => {
    if (!trigger) return null;
    return buildProjectDataMartContextValue({
      ...trigger.dataMart,
      createdAt: trigger.createdAt,
      modifiedAt: trigger.modifiedAt,
      createdByUser: trigger.createdByUser,
    });
  }, [trigger]);

  const handleSubmit = useCallback(
    async (data: ScheduledTriggerFormData) => {
      if (!trigger) return;

      await scheduledTriggerService.updateScheduledTrigger(trigger.dataMart.id, trigger.id, {
        cronExpression: data.cronExpression,
        timeZone: data.timeZone,
        isActive: data.isActive,
      });
      await onSaved?.();
      handleFormSubmitSuccess();
    },
    [handleFormSubmitSuccess, onSaved, trigger]
  );

  if (!trigger || !initialFormData || !dataMartContextValue) {
    return null;
  }

  return (
    <Sheet
      open={isOpen}
      onOpenChange={open => {
        if (!open) {
          handleClose();
        }
      }}
    >
      <SheetContent data-testid='projectTriggerEditSheet'>
        <SheetHeader>
          <SheetTitle>Edit Scheduled Trigger</SheetTitle>
          <SheetDescription>
            Configure automatic runs for your reports or connectors.
          </SheetDescription>
        </SheetHeader>

        <DataMartContext.Provider value={dataMartContextValue}>
          <ScheduledTriggerForm
            initialData={initialFormData}
            onSubmit={handleSubmit}
            onCancel={handleClose}
            onDirtyChange={handleFormDirtyChange}
          />
        </DataMartContext.Provider>
        {/* Rendered inside SheetContent so Radix treats it as a nested dismissable layer;
              interacting with it then doesn't dismiss the sheet (which caused a re-open loop). */}
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
      </SheetContent>
    </Sheet>
  );
}
