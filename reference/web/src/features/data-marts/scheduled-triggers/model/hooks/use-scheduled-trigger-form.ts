import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { ScheduledTriggerType, TRIGGER_CONFIG_TYPES } from '../../enums';
import { scheduledTriggerSchema, type ScheduledTriggerFormData } from '../../schemas';

interface UseScheduledTriggerFormOptions {
  initialData?: ScheduledTriggerFormData;
  preSelectedReportId?: string;
  preSelectedType?: ScheduledTriggerType;
  onSubmit: (data: ScheduledTriggerFormData) => Promise<void>;
}

export function useScheduledTriggerForm({
  initialData,
  preSelectedReportId,
  preSelectedType,
  onSubmit,
}: UseScheduledTriggerFormOptions) {
  const form = useForm<ScheduledTriggerFormData>({
    resolver: zodResolver(scheduledTriggerSchema),
    defaultValues: {
      type: initialData ? initialData.type : (preSelectedType ?? ScheduledTriggerType.REPORT_RUN),
      cronExpression: initialData?.cronExpression ?? '',
      timeZone: initialData?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      isActive: initialData?.isActive ?? true,
      triggerConfig: initialData
        ? initialData.triggerConfig
        : {
            type: TRIGGER_CONFIG_TYPES.SCHEDULED_REPORT_RUN,
            reportId: preSelectedReportId ?? '',
          },
    },
  });

  // Update form when preSelectedReportId changes
  useEffect(() => {
    if (preSelectedReportId && form.getValues('type') === ScheduledTriggerType.REPORT_RUN) {
      form.setValue('triggerConfig', {
        type: TRIGGER_CONFIG_TYPES.SCHEDULED_REPORT_RUN,
        reportId: preSelectedReportId,
      });
    }
  }, [preSelectedReportId, form]);

  // Update form when preSelectedType changes
  useEffect(() => {
    if (preSelectedType) {
      form.setValue('type', preSelectedType);

      // Reset triggerConfig based on type
      if (preSelectedType === ScheduledTriggerType.REPORT_RUN) {
        form.setValue('triggerConfig', {
          type: TRIGGER_CONFIG_TYPES.SCHEDULED_REPORT_RUN,
          reportId: preSelectedReportId ?? '',
        });
      } else {
        form.setValue('triggerConfig', null);
      }
    }
  }, [preSelectedType, preSelectedReportId, form]);

  // Handle type change
  const handleTypeChange = (type: ScheduledTriggerType) => {
    form.setValue('type', type);

    // Reset triggerConfig based on type
    if (type === ScheduledTriggerType.REPORT_RUN) {
      form.setValue('triggerConfig', {
        type: TRIGGER_CONFIG_TYPES.SCHEDULED_REPORT_RUN,
        reportId: preSelectedReportId ?? '',
      });
    } else {
      form.setValue('triggerConfig', null);
    }
  };

  const handleSubmit = async (data: ScheduledTriggerFormData) => {
    try {
      await onSubmit(data);
    } catch (error) {
      console.error('Error submitting form:', error);
    }
  };

  return {
    form,
    handleTypeChange,
    handleSubmit: form.handleSubmit(handleSubmit),
    isDirty: form.formState.isDirty,
  };
}
