import { type RefObject, useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { DataMartReport } from '../../shared/model/types/data-mart-report';
import { isEmailDestinationConfig } from '../../shared/model/types/data-mart-report';
import {
  DestinationTypeConfigEnum,
  ReportFormMode,
  TemplateSourceTypeEnum,
  useReport,
} from '../../shared';
import type {
  EmailDestinationConfigDto,
  TemplateSourceDto,
} from '../../shared/services/types/update-report.request.dto';
import type { DataDestination } from '../../../../data-destination';
import { ReportConditionEnum } from '../../shared/enums/report-condition.enum';

export const EmailReportEditFormSchema = z
  .object({
    title: z.string().min(1, 'Title is required'),
    dataDestinationId: z.string().min(1, 'Destination is required'),
    reportCondition: z.nativeEnum(ReportConditionEnum),
    subject: z.string().min(1, 'Subject is required'),
    // messageTemplate is required only for CUSTOM_MESSAGE
    messageTemplate: z.string().optional(),
    insightTemplateId: z.string().optional(),
    // Track which template source type is selected
    templateSourceType: z.nativeEnum(TemplateSourceTypeEnum),
  })
  .refine(
    data => {
      if (data.templateSourceType === TemplateSourceTypeEnum.CUSTOM_MESSAGE) {
        return !!data.messageTemplate && data.messageTemplate.length > 0;
      }
      // For INSIGHT_TEMPLATE, check insightTemplateId
      return !!data.insightTemplateId && data.insightTemplateId.length > 0;
    },
    {
      message: 'Message template is required for custom messages',
      path: ['messageTemplate'],
    }
  );

export type EmailReportEditFormValues = z.infer<typeof EmailReportEditFormSchema>;

interface UseEmailReportFormOptions {
  initialReport?: DataMartReport;
  mode: ReportFormMode;
  dataMartId: string;
  onAfterSubmit?: (report: DataMartReport) => Promise<void> | void;
  onSuccess?: () => void;
  preSelectedDestination?: DataDestination | null;
  pendingOwnerIdsRef?: RefObject<string[] | null>;
}

export function useEmailReportForm({
  initialReport,
  mode,
  dataMartId,
  onAfterSubmit,
  onSuccess,
  preSelectedDestination,
  pendingOwnerIdsRef,
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
        isEmailDestinationConfig(initialReport.destinationConfig) &&
        initialReport.destinationConfig.templateSource.type ===
          TemplateSourceTypeEnum.CUSTOM_MESSAGE
          ? initialReport.destinationConfig.templateSource.config.messageTemplate
          : initialReport?.destinationConfig &&
              isEmailDestinationConfig(initialReport.destinationConfig) &&
              initialReport.destinationConfig.templateSource.type ===
                TemplateSourceTypeEnum.INSIGHT_TEMPLATE
            ? initialReport.destinationConfig.templateSource.config.insightTemplateId
            : '',
      insightTemplateId:
        initialReport?.destinationConfig &&
        isEmailDestinationConfig(initialReport.destinationConfig) &&
        initialReport.destinationConfig.templateSource.type ===
          TemplateSourceTypeEnum.INSIGHT_TEMPLATE
          ? initialReport.destinationConfig.templateSource.config.insightTemplateId
          : undefined,
      templateSourceType:
        initialReport?.destinationConfig &&
        isEmailDestinationConfig(initialReport.destinationConfig)
          ? (initialReport.destinationConfig.templateSource.type as TemplateSourceTypeEnum)
          : TemplateSourceTypeEnum.CUSTOM_MESSAGE,
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
        // Build templateSource from flat form fields
        const templateSource: TemplateSourceDto =
          data.templateSourceType === TemplateSourceTypeEnum.INSIGHT_TEMPLATE
            ? {
                type: TemplateSourceTypeEnum.INSIGHT_TEMPLATE,
                config: {
                  insightTemplateId: data.insightTemplateId ?? '',
                },
              }
            : {
                type: TemplateSourceTypeEnum.CUSTOM_MESSAGE,
                config: {
                  messageTemplate: data.messageTemplate ?? '',
                },
              };

        const destinationConfig: EmailDestinationConfigDto = {
          type: DestinationTypeConfigEnum.EMAIL_CONFIG,
          reportCondition: data.reportCondition,
          subject: data.subject,
          templateSource,
        };

        if (mode === ReportFormMode.CREATE) {
          result = await createReport({
            title: data.title,
            dataMartId,
            dataDestinationId: data.dataDestinationId,
            destinationConfig,
            ...(pendingOwnerIdsRef?.current != null
              ? { ownerIds: pendingOwnerIdsRef.current }
              : {}),
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
          });
        }

        if (!result || reportError) {
          setFormError(reportError ?? 'An error occurred while submitting the form');
          return;
        }

        try {
          await onAfterSubmit?.(result);
        } catch (e) {
          console.error('onAfterSubmit failed', e);
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
      onAfterSubmit,
      onSuccess,
      clearError,
      reportError,
      pendingOwnerIdsRef,
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
