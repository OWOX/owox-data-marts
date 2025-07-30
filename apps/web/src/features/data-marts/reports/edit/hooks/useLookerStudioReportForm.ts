import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type {
  DataMartReport,
  DestinationConfig,
} from '../../shared/model/types/data-mart-report.ts';
import { isLookerStudioDestinationConfig } from '../../shared/model/types/data-mart-report.ts';
import { DestinationTypeConfigEnum, useReport } from '../../shared';

// Define the form schema
const lookerStudioReportFormSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  dataDestinationId: z.string().min(1, 'Destination is required'),
  cacheLifetime: z.number().min(300, 'Cache time must be at least 5 minutes (300 seconds)'),
});

// Define the form data type
type LookerStudioReportFormData = z.infer<typeof lookerStudioReportFormSchema>;

interface UseLookerStudioReportFormProps {
  initialReport?: DataMartReport;
  dataMartId: string;
  onSuccess?: () => void;
}

export function useLookerStudioReportForm({
  initialReport,
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
      cacheLifetime:
        initialReport?.destinationConfig &&
        isLookerStudioDestinationConfig(initialReport.destinationConfig)
          ? initialReport.destinationConfig.cacheLifetime
          : 300,
    },
    mode: 'onTouched',
  });

  const onSubmit = async (data: LookerStudioReportFormData) => {
    try {
      setFormError(null);

      const { title, dataDestinationId, cacheLifetime } = data;
      const destinationConfig: DestinationConfig = {
        type: DestinationTypeConfigEnum.LOOKER_STUDIO_CONFIG,
        cacheLifetime,
      };

      if (initialReport) {
        await updateReport(initialReport.id, {
          title,
          dataDestinationId,
          destinationConfig,
        });
      } else {
        await createReport({
          title,
          dataMartId,
          dataDestinationId,
          destinationConfig,
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
