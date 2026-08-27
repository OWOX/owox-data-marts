import { useCallback, useEffect, useState, type RefObject } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { DataMartReport } from '../../shared/model/types/data-mart-report.ts';
import {
  DestinationTypeConfigEnum,
  extractGoogleSheetsUrlComponents,
  getGoogleSheetsReportDocumentUrl,
  isValidGoogleSheetsUrl,
  ReportFormMode,
  useReport,
} from '../../shared';
import type { DataDestination } from '../../../../data-destination/shared/model/types';
import {
  DataDestinationType,
  reportNamesTargetDocument,
} from '../../../../data-destination/shared/enums';
import type { DestinationConfigDto } from '../../shared/services';
import { DEFAULT_REPORT_TITLE } from '../../shared';
import {
  AggregationRuleSchema,
  DateTruncRuleSchema,
  FilterRuleSchema,
  SortRuleSchema,
} from '../../../shared/types/output-config';

export const ReportEditFormSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  documentUrl: z.string().refine(isValidGoogleSheetsUrl, 'Enter a valid Google Sheets URL'),
  dataDestinationId: z.string().min(1, 'Destination is required'),
  columnConfig: z
    .array(z.string())
    .nullable()
    .refine(val => val === null || val.length > 0, 'At least one column must be selected'),
  filterConfig: z.array(FilterRuleSchema).nullable(),
  sortConfig: z.array(SortRuleSchema).nullable(),
  limitConfig: z.number().int().positive().max(10_000_000).nullable(),
  aggregationConfig: z.array(AggregationRuleSchema).nullable(),
  dateTruncConfig: z.array(DateTruncRuleSchema).nullable(),
  uniqueCountConfig: z.array(z.string()),
});

export type ReportEditFormValues = z.infer<typeof ReportEditFormSchema>;

/**
 * A destination that names no document is not asked for one, so its URL must not be validated
 * either. Everything else is identical: the output controls decide what the destination reads.
 */
export function buildReportEditFormSchema(destinationType: DataDestinationType) {
  return reportNamesTargetDocument(destinationType)
    ? ReportEditFormSchema
    : ReportEditFormSchema.extend({ documentUrl: z.string() });
}

interface UseReportFormOptions {
  initialReport?: DataMartReport;
  mode: ReportFormMode;
  dataMartId: string;
  onAfterSubmit?: (report: DataMartReport) => Promise<void> | void;
  onSuccess?: () => void;
  preSelectedDestination?: DataDestination | null;
  pendingOwnerIdsRef?: RefObject<string[] | null>;
  /** The destination this report is being configured for. */
  destinationType?: DataDestinationType;
}

export function useReportForm({
  initialReport,
  mode,
  dataMartId,
  onAfterSubmit,
  onSuccess,
  preSelectedDestination,
  pendingOwnerIdsRef,
  destinationType = DataDestinationType.GOOGLE_SHEETS,
}: UseReportFormOptions) {
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { updateReport, createReport, error: reportError, clearError } = useReport();

  useEffect(() => {
    if (isSubmitting && reportError) {
      setFormError(reportError);
      setIsSubmitting(false);
    }
  }, [reportError, isSubmitting]);

  const form = useForm<ReportEditFormValues>({
    resolver: zodResolver(buildReportEditFormSchema(destinationType)),
    defaultValues: {
      title: initialReport?.title ?? DEFAULT_REPORT_TITLE,
      documentUrl: getGoogleSheetsReportDocumentUrl(initialReport?.destinationConfig),
      dataDestinationId: initialReport?.dataDestination.id ?? preSelectedDestination?.id ?? '', // Use preSelectedDestination here
      columnConfig: initialReport?.columnConfig ?? null,
      filterConfig: initialReport?.filterConfig ?? null,
      sortConfig: initialReport?.sortConfig ?? null,
      limitConfig: initialReport?.limitConfig ?? null,
      aggregationConfig: initialReport?.aggregationConfig ?? null,
      dateTruncConfig: initialReport?.dateTruncConfig ?? null,
      uniqueCountConfig: initialReport?.uniqueCountConfig ?? [],
    },
    mode: 'onTouched',
  });

  const { register, handleSubmit, formState, reset } = form;
  const { errors, isDirty, isValid } = formState;

  const onSubmit = useCallback(
    async (data: ReportEditFormValues) => {
      try {
        // Clear any previous errors
        setFormError(null);
        clearError();
        setIsSubmitting(true);

        // Named one by one rather than derived from reportNamesTargetDocument: that predicate is
        // false for every destination that stores no document — Data Studio, Email, Slack and the
        // rest — so a fallback branch would save any of them as an Excel report, silently and
        // with no error anywhere. Only two types reach this form today; a third one has to be
        // added here deliberately, and until it is, it fails where it can still be seen.
        let destinationConfig: DestinationConfigDto;
        switch (destinationType) {
          case DataDestinationType.GOOGLE_SHEETS: {
            const { spreadsheetId, sheetId } = extractGoogleSheetsUrlComponents(data.documentUrl);
            if (!spreadsheetId) {
              setFormError('Invalid Google Sheets URL');
              return;
            }
            destinationConfig = {
              type: DestinationTypeConfigEnum.GOOGLE_SHEETS_CONFIG,
              spreadsheetId,
              sheetId,
            };
            break;
          }
          case DataDestinationType.EXCEL:
            destinationConfig = { type: DestinationTypeConfigEnum.EXCEL_CONFIG };
            break;
          default:
            setFormError(`This form cannot configure a ${destinationType} report`);
            return;
        }

        let result;

        if (mode === ReportFormMode.CREATE) {
          result = await createReport({
            title: data.title,
            dataMartId: dataMartId,
            dataDestinationId: data.dataDestinationId,
            destinationConfig,
            ...(pendingOwnerIdsRef?.current != null
              ? { ownerIds: pendingOwnerIdsRef.current }
              : {}),
            columnConfig: data.columnConfig,
            filterConfig: data.filterConfig,
            sortConfig: data.sortConfig,
            limitConfig: data.limitConfig,
            aggregationConfig: data.aggregationConfig,
            dateTruncConfig: data.dateTruncConfig,
            uniqueCountConfig: data.uniqueCountConfig,
          });
        } else {
          if (!initialReport) {
            setFormError('Initial report is required for edit mode');
            return;
          }
          result = await updateReport(initialReport.id, {
            title: data.title,
            dataDestinationId: data.dataDestinationId,
            destinationConfig,
            ...(pendingOwnerIdsRef?.current != null
              ? { ownerIds: pendingOwnerIdsRef.current }
              : {}),
            columnConfig: data.columnConfig,
            filterConfig: data.filterConfig,
            sortConfig: data.sortConfig,
            limitConfig: data.limitConfig,
            aggregationConfig: data.aggregationConfig,
            dateTruncConfig: data.dateTruncConfig,
            uniqueCountConfig: data.uniqueCountConfig,
          });
        }

        if (!result || reportError) {
          setFormError(reportError ?? 'An error occurred while submitting the form');
          return;
        }

        // allow parent to persist schedule (create/update/delete trigger)
        try {
          await onAfterSubmit?.(result);
        } catch (e) {
          // ignore here; parent may handle toast/UI, but don't block form
          console.error('onAfterSubmit failed', e);
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
      onAfterSubmit,
      onSuccess,
      clearError,
      reportError,
      pendingOwnerIdsRef,
      destinationType,
    ]
  );

  return {
    form,
    register,
    handleSubmit,
    errors,
    isDirty,
    isValid,
    reset,
    formError,
    isSubmitting,
    setFormError,
    getValues: form.getValues,
    onSubmit,
  };
}
