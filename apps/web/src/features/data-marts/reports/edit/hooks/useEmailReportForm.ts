import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { DataMartReport } from '../../shared/model/types/data-mart-report';
import { isEmailDestinationConfig } from '../../shared/model/types/data-mart-report';
import { DestinationTypeConfigEnum, ReportFormMode, useReport } from '../../shared';
import type { DataDestination } from '../../../../data-destination/shared/model/types';
import { ReportConditionEnum } from '../../shared/enums/report-condition.enum';

export const EmailReportEditFormSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  dataDestinationId: z.string().min(1, 'Destination is required'),
  reportCondition: z.nativeEnum(ReportConditionEnum),
  subject: z.string().min(1, 'Subject is required'),
  messageTemplate: z.string().min(1, 'Message body is required'),
});

export type EmailReportEditFormValues = z.infer<typeof EmailReportEditFormSchema>;

interface UseEmailReportFormOptions {
  initialReport?: DataMartReport;
  mode: ReportFormMode;
  dataMartId: string;
  onSuccess?: () => void;
  preSelectedDestination?: DataDestination | null;
}

export function useEmailReportForm({
  initialReport,
  mode,
  dataMartId,
  onSuccess,
  preSelectedDestination,
}: UseEmailReportFormOptions) {
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { updateReport, createReport, error: reportError, clearError } = useReport();

  useEffect(() => {
    if (isSubmitting && reportError) {
      setFormError(reportError);
      setIsSubmitting(false);
    }
  }, [reportError, isSubmitting]);

  const form = useForm<EmailReportEditFormValues>({
    resolver: zodResolver(EmailReportEditFormSchema),
    defaultValues: {
      title: initialReport?.title ?? '',
      dataDestinationId: initialReport?.dataDestination.id ?? preSelectedDestination?.id ?? '',
      reportCondition:
        initialReport?.destinationConfig &&
        isEmailDestinationConfig(initialReport.destinationConfig)
          ? initialReport.destinationConfig.reportCondition
          : ReportConditionEnum.ALWAYS,
      subject:
        initialReport?.destinationConfig &&
        isEmailDestinationConfig(initialReport.destinationConfig)
          ? initialReport.destinationConfig.subject
          : '',
      messageTemplate:
        initialReport?.destinationConfig &&
        isEmailDestinationConfig(initialReport.destinationConfig)
          ? initialReport.destinationConfig.messageTemplate
          : '',
    },
    mode: 'onTouched',
  });

  const { handleSubmit, formState, reset } = form;
  const { isDirty, errors } = formState;

  const onSubmit = useCallback(
    async (data: EmailReportEditFormValues) => {
      try {
        setFormError(null);
        clearError();
        setIsSubmitting(true);

        let result;
        const destinationConfig = {
          type: DestinationTypeConfigEnum.EMAIL_CONFIG as const,
          reportCondition: data.reportCondition,
          subject: data.subject,
          messageTemplate: data.messageTemplate,
        };

        if (mode === ReportFormMode.CREATE) {
          result = await createReport({
            title: data.title,
            dataMartId,
            dataDestinationId: data.dataDestinationId,
            destinationConfig,
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
          });
        }

        if (!result || reportError) {
          setFormError(reportError ?? 'An error occurred while submitting the form');
          return;
        }

        onSuccess?.();
      } catch (error) {
        console.error('Error submitting form:', error);
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
    handleSubmit,
    errors,
    isDirty,
    reset,
    formError,
    isSubmitting,
    setFormError,
    onSubmit,
  };
}
