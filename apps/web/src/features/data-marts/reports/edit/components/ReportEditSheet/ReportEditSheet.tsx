import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@owox/ui/components/sheet';
import { UnsavedChangesConfirmationDialog } from '../../../../../../shared/components/UnsavedChangesConfirmationDialog';
import type { DataMartReport } from '../../../shared/model/types/data-mart-report.ts';
import { ReportEditForm } from '../ReportEditForm';
import { DataDestinationProvider, DataDestinationTypeModel } from '../../../../../data-destination';
import { ReportFormMode } from '../../../shared';
import type { DataDestination } from '../../../../../data-destination';
import { useUnsavedGuard } from '../../../../../../hooks/useUnsavedGuard';
import { useIntercomLauncher } from '../../../../../../shared/hooks/useIntercomLauncher';
import { ReportSheetDescription } from '../ReportSheetDescription';

interface ReportEditSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitSuccess?: () => void | Promise<void>;
  initialReport?: DataMartReport;
  mode: ReportFormMode;
  preSelectedDestination?: DataDestination | null;
}

export function ReportEditSheet({
  isOpen,
  onClose,
  onSubmitSuccess,
  initialReport,
  mode,
  preSelectedDestination,
}: ReportEditSheetProps) {
  const {
    showUnsavedDialog,
    setShowUnsavedDialog,
    handleClose,
    confirmClose,
    handleFormDirtyChange,
    handleFormSubmitSuccess,
  } = useUnsavedGuard(onClose);

  useIntercomLauncher(isOpen);

  // The sheet serves every destination whose report is configured the same way, so it names the
  // one in hand rather than assuming Google Sheets. The trailing space belongs to the name, not
  // to the sentence: without a destination the line has to read "a new report", not "a new
  // report report" — and not "a new  report" either.
  const destinationPrefix = preSelectedDestination
    ? `${DataDestinationTypeModel.getInfo(preSelectedDestination.type).displayName} `
    : '';

  return (
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
          <ReportSheetDescription mode={mode} report={initialReport}>
            {mode === ReportFormMode.CREATE
              ? `Fill in the details to create a new ${destinationPrefix}report`
              : `Update details of an existing ${destinationPrefix}report`}
          </ReportSheetDescription>
        </SheetHeader>

        <DataDestinationProvider>
          <ReportEditForm
            initialReport={initialReport}
            mode={mode}
            onDirtyChange={handleFormDirtyChange}
            onSubmit={() => {
              void onSubmitSuccess?.();
              handleFormSubmitSuccess();
            }}
            onCancel={handleClose}
            preSelectedDestination={preSelectedDestination}
          />
        </DataDestinationProvider>
        <UnsavedChangesConfirmationDialog
          open={showUnsavedDialog}
          onOpenChange={setShowUnsavedDialog}
          onConfirm={confirmClose}
        />
      </SheetContent>
    </Sheet>
  );
}
