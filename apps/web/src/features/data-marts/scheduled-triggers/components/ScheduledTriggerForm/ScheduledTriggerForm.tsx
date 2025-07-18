import { useState, useEffect } from 'react';
import { useScheduledTriggerForm } from '../../model';
import { ScheduledTriggerType } from '../../enums';
import type { ScheduledTriggerFormData } from '../../schemas';
import { ReportSelector } from './components';
import { ScheduleConfig } from '../ScheduleConfig/ScheduleConfig.tsx';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormLayout,
  FormFooter,
} from '@owox/ui/components/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
import { ReportsProvider } from '../../../reports/shared';
import TriggerTypeOptionsDescription from './FormDescriptions/TriggerTypeOptionsDescription.tsx';
import TriggerTypeChangeOptionDescription from './FormDescriptions/TriggerTypeChangeOptionDescription.tsx';
import ReportChangingDescription from './FormDescriptions/ReportChangingDescription.tsx';
import ReportSelectionDescription from './FormDescriptions/ReportSelectionDescription.tsx';

interface ScheduledTriggerFormProps {
  initialData?: ScheduledTriggerFormData;
  preSelectedReportId?: string;
  preSelectedType?: ScheduledTriggerType;
  onSubmit: (data: ScheduledTriggerFormData) => Promise<void>;
  onCancel?: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
}

export function ScheduledTriggerForm({
  initialData,
  preSelectedReportId,
  preSelectedType,
  onSubmit,
  onCancel,
  onDirtyChange,
}: ScheduledTriggerFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { form, handleTypeChange, handleSubmit, isDirty } = useScheduledTriggerForm({
    initialData,
    preSelectedReportId,
    preSelectedType,
    onSubmit: async data => {
      setIsSubmitting(true);
      try {
        await onSubmit(data);
      } finally {
        setIsSubmitting(false);
      }
    },
  });

  // Report form dirty state changes
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const { control, watch } = form;

  const triggerType = watch('type');
  const isReportRunTrigger = triggerType === ScheduledTriggerType.REPORT_RUN;

  return (
    <Form {...form}>
      <FormLayout
        noValidate={false}
        footer={
          <FormFooter
            isSubmitting={isSubmitting}
            isDirty={isDirty}
            mode={initialData ? 'edit' : 'create'}
            onSave={() => void handleSubmit()}
            onCancel={onCancel}
            saveLabel={initialData ? 'Save changes' : 'Create trigger'}
          />
        }
      >
        {/* Trigger Type */}
        <FormField
          control={control}
          name='type'
          render={({ field }) => (
            <FormItem>
              <FormLabel tooltip='Choose what you want this trigger to run - a report or a connector'>
                Trigger Type
              </FormLabel>
              <Select
                onValueChange={value => {
                  field.onChange(value);
                  handleTypeChange(value as ScheduledTriggerType);
                }}
                defaultValue={field.value}
                disabled={!!preSelectedType || !!initialData || !!watch('triggerConfig.reportId')}
              >
                <FormControl>
                  <SelectTrigger className={'w-full'}>
                    <SelectValue placeholder='Select trigger type' />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value={ScheduledTriggerType.REPORT_RUN}>Report Run</SelectItem>
                  <SelectItem value={ScheduledTriggerType.CONNECTOR_RUN}>Connector Run</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                {!initialData ? (
                  <TriggerTypeOptionsDescription />
                ) : (
                  <TriggerTypeChangeOptionDescription />
                )}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Report Selector (only for REPORT_RUN type) */}
        {isReportRunTrigger && (
          <FormField
            control={control}
            name='triggerConfig.reportId'
            render={({ field }) => (
              <FormItem>
                <FormLabel tooltip='Select the report that will be run by this trigger'>
                  Report
                </FormLabel>
                <FormControl>
                  <ReportsProvider>
                    <ReportSelector
                      value={field.value}
                      onChange={field.onChange}
                      disabled={!!preSelectedReportId || !!initialData}
                    />
                  </ReportsProvider>
                </FormControl>
                <FormDescription>
                  {initialData?.triggerConfig ? (
                    <ReportChangingDescription />
                  ) : (
                    <ReportSelectionDescription />
                  )}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {/* Schedule Settings */}
        <ScheduleConfig
          showPreview={false}
          cron={watch('cronExpression')}
          timezone={watch('timeZone')}
          enabled={watch('isActive')}
          onChange={data => {
            form.setValue('cronExpression', data.cron, { shouldDirty: true });
            form.setValue('timeZone', data.timezone, { shouldDirty: true });
            form.setValue('isActive', data.enabled, { shouldDirty: true });
          }}
          className={
            'border-border flex flex-col gap-1.5 rounded-md border-b bg-white px-4 py-3 transition-shadow duration-200 hover:shadow-sm dark:border-transparent dark:bg-white/4'
          }
        />
      </FormLayout>
    </Form>
  );
}
