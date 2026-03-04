import { useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import type { InsightEntity } from '../model';

const insightFormSchema = z.object({
  title: z.string().min(1, 'Title cannot be empty'),
  template: z.string().optional(),
});
export type InsightForm = z.infer<typeof insightFormSchema>;

export const useInsightForm = (
  insight: InsightEntity | null,
  updateInsight: (
    id: string,
    data: { title: string; template?: string | null }
  ) => Promise<InsightEntity | null>,
  updateInsightTitle: (id: string, title: string) => Promise<InsightEntity | null>
) => {
  const {
    register,
    watch,
    handleSubmit,
    reset,
    resetField,
    setValue,
    formState: { isSubmitting, dirtyFields },
  } = useForm<InsightForm>({
    resolver: zodResolver(insightFormSchema),
    defaultValues: {
      title: insight?.title ?? '',
      template: insight?.template ?? '',
    },
  });

  const titleValue = watch('title');
  const templateValue = watch('template');
  const isTemplateDirty = Boolean(dirtyFields.template);

  useEffect(() => {
    reset({ title: insight?.title ?? '', template: insight?.template ?? '' });
  }, [insight?.id, insight?.title, insight?.template, reset]);

  const handleTitleUpdate = useCallback(
    async (newTitle: string) => {
      if (!insight) return;
      const trimmedTitle = newTitle.trim();
      setValue('title', trimmedTitle, { shouldDirty: true, shouldValidate: true });
      await updateInsightTitle(insight.id, trimmedTitle);
      resetField('title', { defaultValue: trimmedTitle });
    },
    [insight, resetField, setValue, updateInsightTitle]
  );

  const onSubmit = useCallback(
    async (values: InsightForm) => {
      if (!insight) return;
      const payload = {
        title: values.title.trim(),
        template: values.template && values.template.trim().length > 0 ? values.template : null,
      } as { title: string; template?: string | null };
      const updated = await updateInsight(insight.id, payload);
      if (updated) {
        reset({ title: updated.title, template: updated.template ?? '' });
      }
    },
    [insight, reset, updateInsight]
  );

  return {
    register,
    handleSubmit,
    setValue,
    isTemplateDirty,
    isSubmitting,
    titleValue,
    templateValue,
    handleTitleUpdate,
    onSubmit,
  };
};
