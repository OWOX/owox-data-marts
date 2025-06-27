import { useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { GoogleSheetsReport } from '../../shared/types';
import { useGoogleSheetsReportsList } from '../../shared/model/hooks/useGoogleSheetsReportsList';

const documentUrlRegex =
  /^https:\/\/(docs|spreadsheets)\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/;

const GoogleSheetsReportEditFormSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  documentUrl: z.string().regex(documentUrlRegex, 'Enter a valid Google Sheets URL'),
});

type GoogleSheetsReportEditFormValues = z.infer<typeof GoogleSheetsReportEditFormSchema>;

interface UseGoogleSheetsReportFormOptions {
  initialReport?: GoogleSheetsReport;
  mode: 'edit' | 'create';
  onClose: () => void;
}

export function useGoogleSheetsReportForm({
  initialReport,
  mode,
  onClose,
}: UseGoogleSheetsReportFormOptions) {
  const { createGoogleSheet, updateGoogleSheet } = useGoogleSheetsReportsList();

  const form = useForm<GoogleSheetsReportEditFormValues>({
    resolver: zodResolver(GoogleSheetsReportEditFormSchema),
    defaultValues: {
      title: '',
      documentUrl: '',
    },
  });

  const { register, handleSubmit, formState, reset } = form;
  const { errors, isDirty } = formState;

  const onSubmit = useCallback(
    async (data: GoogleSheetsReportEditFormValues) => {
      try {
        if (mode === 'create') {
          await createGoogleSheet({
            title: data.title,
          });
        } else if (initialReport) {
          await updateGoogleSheet(initialReport.id, {
            title: data.title,
          });
        }
        reset(data);
        onClose();
      } catch {
        // TODO: handle error (e.g. show toast)
      }
    },
    [mode, createGoogleSheet, updateGoogleSheet, initialReport, reset, onClose]
  );

  return {
    form,
    register,
    handleSubmit,
    errors,
    isDirty,
    reset,
    onSubmit,
  };
}
