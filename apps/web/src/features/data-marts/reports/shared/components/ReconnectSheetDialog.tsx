import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Input } from '@owox/ui/components/input';
import { ConfirmationDialog } from '../../../../../shared/components/ConfirmationDialog';
import { showApiErrorToast } from '../../../../../shared/utils/showApiErrorToast';
import { reportService } from '../services';
import { useReport } from '../model/hooks';
import { ReconnectedSheetToast } from './ReconnectedSheetToast';
import type { DataMartReport } from '../model/types/data-mart-report';

/** Long enough to read the result and reach the Run button. */
const TOAST_DURATION_MS = 12000;

interface ReconnectSheetDialogProps {
  report: DataMartReport;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful reconnect so the caller can refresh its list. */
  onReconnected?: () => void | Promise<void>;
}

/**
 * Repairs a Google Sheets report whose sheet was deleted or re-created.
 *
 * The stored sheet ID (gid) dies with the sheet, so the user picks the sheet by
 * NAME instead — the only handle they recognise. An existing sheet with that name
 * is reused; otherwise it is created. The copy says so up front, because reusing
 * means the next run writes into a sheet that may already hold data.
 */
export function ReconnectSheetDialog({
  report,
  open,
  onOpenChange,
  onReconnected,
}: ReconnectSheetDialogProps) {
  const { runReport } = useReport();
  const [title, setTitle] = useState(report.title);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputId = `reconnect-sheet-title-${report.id}`;
  const hintId = `reconnect-sheet-hint-${report.id}`;

  // Re-seed on every open: the report may have been renamed since the last time,
  // and a stale draft title would silently point the report somewhere else.
  useEffect(() => {
    if (open) {
      setTitle(report.title);
    }
  }, [open, report.title]);

  const trimmedTitle = title.trim();

  const handleConfirm = async () => {
    if (!trimmedTitle || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const result = await reportService.reconnectSheet(report.id, { title: trimmedTitle });
      // Reconnecting only repairs the destination, so the toast carries the next
      // step as a button. "Later" is always there: the repair is already complete,
      // and running is a separate decision.
      const message = result.created
        ? `Created sheet "${result.sheetTitle}" and reconnected the report`
        : `Reconnected the report to the existing sheet "${result.sheetTitle}"`;
      toast.custom(
        t => (
          <ReconnectedSheetToast
            toastId={t.id}
            message={message}
            onRun={async () => {
              await runReport(report.id);
              await onReconnected?.();
            }}
          />
        ),
        { duration: TOAST_DURATION_MS }
      );
      onOpenChange(false);
      await onReconnected?.();
    } catch (error) {
      showApiErrorToast(error, 'Failed to reconnect sheet');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={onOpenChange}
      title='Reconnect sheet'
      description='Choose the sheet inside this report’s spreadsheet to write to. OWOX reuses a sheet with this name, or creates it when the spreadsheet has none.'
      confirmLabel={isSubmitting ? 'Reconnecting…' : 'Reconnect'}
      cancelLabel='Cancel'
      confirmDisabled={!trimmedTitle || isSubmitting}
      variant='default'
      onConfirm={() => void handleConfirm()}
    >
      <div className='space-y-2'>
        <label htmlFor={inputId} className='text-sm font-medium'>
          Sheet name
        </label>
        <Input
          id={inputId}
          value={title}
          aria-describedby={hintId}
          disabled={isSubmitting}
          placeholder='Enter a sheet name'
          onChange={event => {
            setTitle(event.target.value);
          }}
        />
        <p id={hintId} className='text-muted-foreground text-sm'>
          A sheet that already holds data will be overwritten by the next run.
        </p>
      </div>
    </ConfirmationDialog>
  );
}
