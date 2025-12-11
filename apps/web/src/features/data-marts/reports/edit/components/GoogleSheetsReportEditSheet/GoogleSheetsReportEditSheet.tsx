import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@owox/ui/components/sheet';
import { ConfirmationDialog } from '../../../../../../shared/components/ConfirmationDialog';
import type { DataMartReport } from '../../../shared/model/types/data-mart-report.ts';
import { GoogleSheetsReportEditForm } from '../GoogleSheetsReportEditForm';
import { DataDestinationProvider } from '../../../../../data-destination';
import { ReportFormMode } from '../../../shared';
import type { DataDestination } from '../../../../../data-destination';
import { useUnsavedGuard } from '../../../../../../hooks/useUnsavedGuard';

interface GoogleSheetsReportEditSheetProps {
  isOpen: boolean;
  onClose: () => void;
  initialReport?: DataMartReport;
  mode: ReportFormMode;
  preSelectedDestination?: DataDestination | null;
}

export function GoogleSheetsReportEditSheet({
  isOpen,
  onClose,
  initialReport,
  mode,
  preSelectedDestination,
}: GoogleSheetsReportEditSheetProps) {
  const {
    showUnsavedDialog,
    setShowUnsavedDialog,
    handleClose,
    confirmClose,
    handleFormDirtyChange,
    handleFormSubmitSuccess,
  } = useUnsavedGuard(onClose);

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
            <SheetTitle>
              {mode === ReportFormMode.CREATE ? 'Create new report' : 'Edit report'}
            </SheetTitle>
            <SheetDescription>
              {mode === ReportFormMode.CREATE
                ? 'Fill in the details to create a new Google Sheets report'
                : 'Update details of an existing Google Sheets report'}
            </SheetDescription>
          </SheetHeader>

          <DataDestinationProvider>
            <GoogleSheetsReportEditForm
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
