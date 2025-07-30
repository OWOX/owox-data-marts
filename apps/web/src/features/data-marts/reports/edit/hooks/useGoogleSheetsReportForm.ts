import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { DataMartReport } from '../../shared/model/types/data-mart-report.ts';
import { isGoogleSheetsDestinationConfig } from '../../shared/model/types/data-mart-report.ts';
import {
  DestinationTypeConfigEnum,
  extractGoogleSheetsUrlComponents,
  isValidGoogleSheetsUrl,
  ReportFormMode,
  useReport,
} from '../../shared';

export const GoogleSheetsReportEditFormSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  documentUrl: z.string().refine(isValidGoogleSheetsUrl, 'Enter a valid Google Sheets URL'),
  dataDestinationId: z.string().min(1, 'Destination is required'),
});

export type GoogleSheetsReportEditFormValues = z.infer<typeof GoogleSheetsReportEditFormSchema>;

interface UseGoogleSheetsReportFormOptions {
  initialReport?: DataMartReport;
  mode: ReportFormMode;
  dataMartId: string;
  onSuccess?: () => void;
}

export function useGoogleSheetsReportForm({
  initialReport,
  mode,
  dataMartId,
  onSuccess,
}: UseGoogleSheetsReportFormOptions) {
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { updateReport, createReport, error: reportError, clearError } = useReport();

  useEffect(() => {
    if (isSubmitting && reportError) {
      setFormError(reportError);
      setIsSubmitting(false);
    }
  }, [reportError, isSubmitting]);

  const form = useForm<GoogleSheetsReportEditFormValues>({
    resolver: zodResolver(GoogleSheetsReportEditFormSchema),
    defaultValues: {
      title: initialReport?.title ?? '',
      documentUrl:
        initialReport?.destinationConfig &&
        isGoogleSheetsDestinationConfig(initialReport.destinationConfig)
          ? `https://docs.google.com/spreadsheets/d/${initialReport.destinationConfig.spreadsheetId}/edit#gid=${initialReport.destinationConfig.sheetId}`
          : '',
      dataDestinationId: initialReport?.dataDestination.id ?? '',
    },
    mode: 'onTouched',
  });

  const { register, handleSubmit, formState, reset } = form;
  const { errors, isDirty } = formState;

  const onSubmit = useCallback(
    async (data: GoogleSheetsReportEditFormValues) => {
      try {
        // Clear any previous errors
        setFormError(null);
        clearError();
        setIsSubmitting(true);

        // Extract spreadsheetId and sheetId from the document URL
        const { spreadsheetId, sheetId } = extractGoogleSheetsUrlComponents(data.documentUrl);
        if (!spreadsheetId) {
          setFormError('Invalid Google Sheets URL');
          return;
        }

        let result;

        if (mode === ReportFormMode.CREATE) {
          result = await createReport({
            title: data.title,
            dataMartId: dataMartId,
            dataDestinationId: data.dataDestinationId,
            destinationConfig: {
              type: DestinationTypeConfigEnum.GOOGLE_SHEETS_CONFIG,
              spreadsheetId,
              sheetId,
            },
          });
        } else {
          if (!initialReport) {
            setFormError('Initial report is required for edit mode');
            return;
          }
          result = await updateReport(initialReport.id, {
            title: data.title,
            dataDestinationId: data.dataDestinationId,
            destinationConfig: {
              type: DestinationTypeConfigEnum.GOOGLE_SHEETS_CONFIG,
              spreadsheetId,
              sheetId,
            },
          });
        }

        if (!result || reportError) {
          setFormError(reportError ?? 'An error occurred while submitting the form');
          return;
        }

        onSuccess?.();
      } catch (error) {
        console.error('Error submitting form:', error);
        // If it's not an Error instance, use a generic message
        setFormError('An error occurred while submitting the form');
      }
    },
    [
      mode,
      initialReport,
      dataMartId,
      createReport,
      updateReport,
      onSuccess,
      clearError,
      reportError,
    ]
  );

  return {
    form,
    register,
    handleSubmit,
    errors,
    isDirty,
    reset,
    formError,
    isSubmitting,
    setFormError,
    getValues: form.getValues,
    onSubmit,
  };
}
