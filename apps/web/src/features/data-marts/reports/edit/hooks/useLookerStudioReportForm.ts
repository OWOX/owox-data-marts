import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { DataMartReport } from '../../shared/model/types/data-mart-report.ts';
import { isLookerStudioDestinationConfig } from '../../shared/model/types/data-mart-report.ts';
import { DestinationTypeConfigEnum, ReportFormMode, useReport } from '../../shared';

// Define the form schema
const lookerStudioReportFormSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  dataDestinationId: z.string().min(1, 'Destination is required'),
  cacheTime: z.number().min(300, 'Cache time must be at least 5 minutes (300 seconds)'),
});

// Define the form data type
type LookerStudioReportFormData = z.infer<typeof lookerStudioReportFormSchema>;

interface UseLookerStudioReportFormProps {
  initialReport?: DataMartReport;
  mode: ReportFormMode;
  dataMartId: string;
  onSuccess?: () => void;
}

export function useLookerStudioReportForm({
  initialReport,
  mode,
  dataMartId,
  onSuccess,
}: UseLookerStudioReportFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const { createReport, updateReport } = useReport();

  const form = useForm<LookerStudioReportFormData>({
    resolver: zodResolver(lookerStudioReportFormSchema),
    defaultValues: {
      title: initialReport?.title ?? '',
      dataDestinationId: initialReport?.dataDestination.id ?? '',
      cacheTime:
        initialReport?.destinationConfig &&
        isLookerStudioDestinationConfig(initialReport.destinationConfig)
          ? initialReport.destinationConfig.cacheTime
          : 300,
    },
    mode: 'onTouched',
  });

  const onSubmit = async (data: LookerStudioReportFormData) => {
    try {
      setFormError(null);

      if (mode === ReportFormMode.CREATE) {
        await createReport({
          title: data.title,
          dataMartId,
          dataDestinationId: data.dataDestinationId,
          destinationConfig: {
            type: DestinationTypeConfigEnum.LOOKER_STUDIO_CONFIG,
            destinationId: data.dataDestinationId,
            cacheTime: data.cacheTime,
          },
        });
      } else if (mode === ReportFormMode.EDIT && initialReport) {
        await updateReport(initialReport.id, {
          title: data.title,
          dataDestinationId: data.dataDestinationId,
          destinationConfig: {
            type: DestinationTypeConfigEnum.LOOKER_STUDIO_CONFIG,
            destinationId: data.dataDestinationId,
            cacheTime: data.cacheTime,
          },
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
    isDirty: form.formState.isDirty,
    reset: form.reset,
  };
}
