import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@owox/ui/components/sheet';
import { ConfirmationDialog } from '../../../../../../shared/components/ConfirmationDialog';
import type { DataMartReport } from '../../../shared/model/types/data-mart-report.ts';
import { LookerStudioReportEditForm } from '../LookerStudioReportEditForm';
import { DataDestinationProvider } from '../../../../../data-destination';
import { ReportFormMode } from '../../../shared';
import type { DataDestination } from '../../../../../data-destination';
import { useUnsavedGuard } from '../../../../../../hooks/useUnsavedGuard';
import { useIntercomLauncher } from '../../../../../../shared/hooks/useIntercomLauncher';

interface LookerStudioReportEditSheetProps {
  isOpen: boolean;
  onClose: () => void;
  initialReport?: DataMartReport;
  mode: ReportFormMode;
  preSelectedDestination?: DataDestination | null;
}

export function LookerStudioReportEditSheet({
  isOpen,
  onClose,
  initialReport,
  mode,
  preSelectedDestination,
}: LookerStudioReportEditSheetProps) {
  const {
    showUnsavedDialog,
    setShowUnsavedDialog,
    handleClose,
    confirmClose,
    handleFormDirtyChange,
    handleFormSubmitSuccess,
  } = useUnsavedGuard(onClose);

  useIntercomLauncher(isOpen);

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
            <SheetTitle>{preSelectedDestination?.title ?? 'Looker Studio'}</SheetTitle>
            <SheetDescription>
              {mode === ReportFormMode.CREATE
                ? 'Set up Data Mart as a data source'
                : 'Update connection details'}
            </SheetDescription>
          </SheetHeader>

          <DataDestinationProvider>
            <LookerStudioReportEditForm
              initialReport={initialReport}
              mode={mode}
              onDirtyChange={handleFormDirtyChange}
              onSubmit={handleFormSubmitSuccess}
              onCancel={handleClose}
              preSelectedDestination={preSelectedDestination}
            />
          </DataDestinationProvider>
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
