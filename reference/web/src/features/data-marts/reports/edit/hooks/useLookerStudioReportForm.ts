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
import type { DataDestination } from '../../../../data-destination/shared/model/types';

// Define the form schema - simplified for editing existing reports
const lookerStudioReportFormSchema = z.object({
  cacheLifetime: z.number().min(300, 'Cache time must be at least 5 minutes (300 seconds)'),
});

// Define the form data type
type LookerStudioReportFormData = z.infer<typeof lookerStudioReportFormSchema>;

interface UseLookerStudioReportFormProps {
  initialReport?: DataMartReport;
  dataMartId: string;
  onSuccess?: () => void;
  preSelectedDestination?: DataDestination | null;
}

export function useLookerStudioReportForm({
  initialReport,
  dataMartId,
  onSuccess,
  preSelectedDestination,
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
    },
    mode: 'onTouched',
  });

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
          title: `Looker Studio Report`, // Keep existing
          dataDestinationId: initialReport.dataDestination.id, // Keep existing
          destinationConfig,
        });
      } else {
        // This shouldn't happen in our use case, but keeping for compatibility
        await createReport({
          title: `Looker Studio Report`,
          dataMartId,
          dataDestinationId: preSelectedDestination?.id ?? '',
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
