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
} from '@owox/ui/components/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
import { Button } from '@owox/ui/components/button';
import { ReportsProvider } from '../../../reports/shared';

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
      <form
        className='flex flex-1 flex-col overflow-hidden'
        onSubmit={e => {
          e.preventDefault();
          void handleSubmit();
        }}
      >
        <div className='bg-muted flex-1 overflow-y-auto p-4 dark:bg-transparent'>
          <div className='flex min-h-full flex-col gap-4'>
            {/* Trigger Type */}
            <FormField
              control={control}
              name='type'
              render={({ field }) => (
                <FormItem
                  className={
                    'border-border flex flex-col gap-1.5 rounded-md border-b bg-white px-4 py-3 transition-shadow duration-200 hover:shadow-sm dark:border-0 dark:bg-white/4'
                  }
                >
                  <FormLabel
                    className={'text-foreground flex items-center gap-1.5 text-sm font-medium'}
                  >
                    Trigger Type
                  </FormLabel>
                  <Select
                    onValueChange={value => {
                      field.onChange(value);
                      handleTypeChange(value as ScheduledTriggerType);
                    }}
                    defaultValue={field.value}
                    disabled={
                      !!preSelectedType || !!initialData || !!watch('triggerConfig.reportId')
                    }
                  >
                    <FormControl>
                      <SelectTrigger className={'w-full'}>
                        <SelectValue placeholder='Select trigger type' />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={ScheduledTriggerType.REPORT_RUN}>Report Run</SelectItem>
                      <SelectItem value={ScheduledTriggerType.CONNECTOR_RUN}>
                        Connector Run
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    {!initialData
                      ? 'Choose the type of trigger - run a report or connector.'
                      : 'Trigger type cannot be changed after creation.'}
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
                  <FormItem
                    className={
                      'border-border flex flex-col gap-1.5 rounded-md border-b bg-white px-4 py-3 transition-shadow duration-200 hover:shadow-sm dark:border-0 dark:bg-white/4'
                    }
                  >
                    <FormLabel
                      className={'text-foreground flex items-center gap-1.5 text-sm font-medium'}
                    >
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
                      <span className={'text-sm'}>
                        {initialData?.triggerConfig
                          ? 'The report cannot be changed for existing triggers. To use a different report, please create a new trigger'
                          : 'Select the report that will be run by this trigger'}
                      </span>
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Schedule Settings */}
            <div
              className={
                'border-border flex flex-col gap-1.5 rounded-md border-b bg-white px-4 py-4 transition-shadow duration-200 hover:shadow-sm dark:border-0 dark:bg-white/4'
              }
            >
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
              />
            </div>
          </div>
        </div>
        <div className='flex flex-col gap-1.5 border-t px-4 py-3'>
          <Button type='submit' disabled={isSubmitting || !isDirty} className='w-full'>
            {isSubmitting ? 'Saving...' : 'Save'}
          </Button>
          {onCancel && (
            <Button variant='outline' onClick={onCancel} type='button' className='w-full'>
              Cancel
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
}
