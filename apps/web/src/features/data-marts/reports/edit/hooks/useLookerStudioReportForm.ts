import { type RefObject, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type {
  DataMartReport,
  DestinationConfig,
} from '../../shared/model/types/data-mart-report.ts';
import { isLookerStudioDestinationConfig } from '../../shared/model/types/data-mart-report.ts';
import { DEFAULT_REPORT_TITLE, DestinationTypeConfigEnum, useReport } from '../../shared';
import type { DataDestination } from '../../../../data-destination/shared/model/types';
import {
  AggregationRuleSchema,
  DateTruncRuleSchema,
  FilterRuleSchema,
  SortRuleSchema,
} from '../../../shared/types/output-config';

// Define the form schema - simplified for editing existing reports
export const lookerStudioReportFormSchema = z.object({
  cacheLifetime: z.number().min(300, 'Cache time must be at least 5 minutes (300 seconds)'),
  columnConfig: z
    .array(z.string())
    .nullable()
    .refine(val => val === null || val.length > 0, 'At least one column must be selected'),
  filterConfig: z.array(FilterRuleSchema).nullable(),
  sortConfig: z.array(SortRuleSchema).nullable(),
  limitConfig: z.number().int().positive().max(10_000_000).nullable(),
  aggregationConfig: z.array(AggregationRuleSchema).nullable(),
  dateTruncConfig: z.array(DateTruncRuleSchema).nullable(),
  uniqueCountConfig: z.boolean(),
});

// Define the form data type
type LookerStudioReportFormData = z.infer<typeof lookerStudioReportFormSchema>;

interface UseLookerStudioReportFormProps {
  initialReport?: DataMartReport;
  dataMartId: string;
  onSuccess?: () => void;
  preSelectedDestination?: DataDestination | null;
  pendingOwnerIdsRef?: RefObject<string[] | null>;
}

export function useLookerStudioReportForm({
  initialReport,
  dataMartId,
  onSuccess,
  preSelectedDestination,
  pendingOwnerIdsRef,
}: UseLookerStudioReportFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const { createReport, updateReport } = useReport();

  const form = useForm<LookerStudioReportFormData>({
    resolver: zodResolver(lookerStudioReportFormSchema),
    defaultValues: {
      cacheLifetime:
        initialReport?.destinationConfig &&
        isLookerStudioDestinationConfig(initialReport.destinationConfig)
          ? initialReport.destinationConfig.cacheLifetime
          : 300,
      columnConfig: initialReport?.columnConfig ?? null,
      filterConfig: initialReport?.filterConfig ?? null,
      sortConfig: initialReport?.sortConfig ?? null,
      limitConfig: initialReport?.limitConfig ?? null,
      aggregationConfig: initialReport?.aggregationConfig ?? null,
      dateTruncConfig: initialReport?.dateTruncConfig ?? null,
      uniqueCountConfig: initialReport?.uniqueCountConfig ?? false,
    },
    mode: 'onTouched',
  });

  const { formState, reset } = form;
  const { isDirty, isValid } = formState;

  const onSubmit = async (data: LookerStudioReportFormData) => {
    try {
      setFormError(null);

      const { cacheLifetime } = data;
      const destinationConfig: DestinationConfig = {
        type: DestinationTypeConfigEnum.LOOKER_STUDIO_CONFIG,
        cacheLifetime,
      };

      if (initialReport) {
        // Only update the destination config, keep existing title and destination
        await updateReport(initialReport.id, {
          title: initialReport.title || DEFAULT_REPORT_TITLE,
          dataDestinationId: initialReport.dataDestination.id,
          destinationConfig,
          ...(pendingOwnerIdsRef?.current != null ? { ownerIds: pendingOwnerIdsRef.current } : {}),
          columnConfig: data.columnConfig,
          filterConfig: data.filterConfig,
          sortConfig: data.sortConfig,
          limitConfig: data.limitConfig,
          aggregationConfig: data.aggregationConfig,
          dateTruncConfig: data.dateTruncConfig,
          uniqueCountConfig: data.uniqueCountConfig,
        });
      } else {
        // This shouldn't happen in our use case, but keeping for compatibility
        await createReport({
          title: DEFAULT_REPORT_TITLE,
          dataMartId,
          dataDestinationId: preSelectedDestination?.id ?? '',
          destinationConfig,
          ...(pendingOwnerIdsRef?.current != null ? { ownerIds: pendingOwnerIdsRef.current } : {}),
          columnConfig: data.columnConfig,
          filterConfig: data.filterConfig,
          sortConfig: data.sortConfig,
          limitConfig: data.limitConfig,
          aggregationConfig: data.aggregationConfig,
          dateTruncConfig: data.dateTruncConfig,
          uniqueCountConfig: data.uniqueCountConfig,
        });
      }
      onSuccess?.();
    } catch (error) {
      console.error('Error submitting form:', error);
      setFormError('Failed to save report. Please try again.');
    }
  };

  return {
    form,
    onSubmit,
    formError,
    isSubmitting: form.formState.isSubmitting,
    isDirty,
    isValid,
    reset,
  };
}
