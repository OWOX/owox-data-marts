import { useEffect, useCallback } from 'react';
import { Input } from '@owox/ui/components/input';
import type { GoogleSheetsReport } from '../../../shared/types';
import {
  Tooltip,
  TooltipTrigger,
  TooltipProvider,
  TooltipContent,
} from '@owox/ui/components/tooltip';
import { HelpCircle } from 'lucide-react';
import { FormField } from '../../../../../../../shared/components/FormField';
import { useGoogleSheetsReportForm } from '../../hooks/useGoogleSheetsReportForm';
import { useAutoFocus } from '../../../../../../../hooks/useAutoFocus';

interface GoogleSheetsReportEditFormProps {
  initialReport?: GoogleSheetsReport;
  mode?: 'edit' | 'create';
  onSubmitSuccess?: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
}

export function GoogleSheetsReportEditForm({
  initialReport,
  mode = 'edit',
  onSubmitSuccess,
  onDirtyChange,
}: GoogleSheetsReportEditFormProps) {
  // Generate unique IDs for accessibility
  const formId = 'google-sheets-edit-form';
  const titleInputId = 'google-sheets-title-input';
  const documentUrlInputId = 'google-sheets-document-url-input';
  const helpTooltipId = 'google-sheets-help-tooltip';

  // Use custom hooks
  useAutoFocus({ elementId: titleInputId, isOpen: true, delay: 150 });

  // Create wrapper function for onClose to handle undefined onSubmitSuccess
  const handleClose = useCallback(() => {
    onSubmitSuccess?.();
  }, [onSubmitSuccess]);

  const { register, handleSubmit, errors, isDirty, reset, onSubmit } = useGoogleSheetsReportForm({
    initialReport,
    mode,
    onClose: handleClose,
  });

  // Reset form when component mounts or initialReport changes
  useEffect(() => {
    if (mode === 'edit' && initialReport) {
      reset({
        title: initialReport.title || '',
        documentUrl: `https://docs.google.com/spreadsheets/d/${initialReport.destinationConfig.spreadsheetId}`,
      });
    } else if (mode === 'create') {
      reset({ title: '', documentUrl: '' });
    }
  }, [initialReport, mode, reset]);

  // Notify parent about dirty state changes
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  return (
    <form
      id={formId}
      onSubmit={e => {
        void handleSubmit(onSubmit)(e);
      }}
      className='flex flex-1 flex-col overflow-hidden'
      noValidate
    >
      <div className='bg-muted flex-1 overflow-y-auto p-4 dark:bg-transparent'>
        <div className='flex min-h-full flex-col gap-4'>
          <FormField label='Report title' id={titleInputId} error={errors.title?.message}>
            <Input
              id={titleInputId}
              placeholder='Report title'
              {...register('title', { required: true })}
              aria-describedby={errors.title ? 'title-error' : undefined}
              aria-invalid={!!errors.title}
            />
          </FormField>

          <FormField
            label='Document Link'
            id={documentUrlInputId}
            tooltip={
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type='button'
                      className='text-muted-foreground/50 hover:text-foreground transition'
                      aria-label='Help information about document link'
                      aria-describedby={helpTooltipId}
                    >
                      <HelpCircle className='h-3.5 w-3.5' aria-hidden='true' />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent id={helpTooltipId} side='top' align='center' role='tooltip'>
                    This is a link to the original document in Google Sheets
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            }
            error={errors.documentUrl?.message}
          >
            <ul className='text-muted-foreground list-decimal space-y-1 pl-4 text-sm' role='list'>
              <li role='listitem'>Go to your Google Sheet document.</li>
              <li role='listitem'>Share it with the service account email.</li>
              <li role='listitem'>Paste the document URL below.</li>
            </ul>
            <Input
              id={documentUrlInputId}
              placeholder='Document URL'
              {...register('documentUrl')}
              aria-describedby={errors.documentUrl ? 'document-url-error' : undefined}
              aria-invalid={!!errors.documentUrl}
            />
          </FormField>

          <div className='border-border flex flex-col gap-1.5 rounded-md border-b bg-white px-4 py-3 transition-shadow duration-200 hover:shadow-sm dark:border-0 dark:bg-white/4'>
            <p className='text-sm font-medium'>
              Trigger <span className='text-muted-foreground/50'>Coming soon...</span>
            </p>
          </div>
        </div>
      </div>
    </form>
  );
}
