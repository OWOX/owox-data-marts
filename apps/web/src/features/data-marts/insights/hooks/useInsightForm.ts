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

// Тип для функції оновлення, яку ми передамо з useInsightData
// type UpdateInsightFunction = (
//   id: string,
//   payload: { title: string; template?: string | null }
// ) => Promise<InsightEntity | undefined>;

export const useInsightForm = (
  insight: InsightEntity | undefined,
  updateInsight: (
    id: string,
    data: { title: string; template?: string | null }
  ) => Promise<InsightEntity | null>
) => {
  const {
    register,
    watch,
    handleSubmit,
    reset,
    setValue,
    formState: { isDirty, isSubmitting },
  } = useForm<InsightForm>({
    resolver: zodResolver(insightFormSchema),
    defaultValues: {
      title: insight?.title ?? '',
      template: insight?.template ?? '',
    },
  });

  // Скидання форми при зміні обраного інсайту
  useEffect(() => {
    reset({ title: insight?.title ?? '', template: insight?.template ?? '' });
  }, [insight?.id, insight?.title, insight?.template, reset]);

  // Обробник оновлення заголовка (з InlineEditTitle)
  const handleTitleUpdate = useCallback(
    async (newTitle: string) => {
      setValue('title', newTitle, { shouldDirty: true, shouldValidate: true });
    },
    [setValue]
  );

  // Обробник відправки форми
  const onSubmit = useCallback(
    async (values: InsightForm) => {
      if (!insight) return;
      const payload = {
        title: values.title.trim(),
        template: values.template && values.template.trim().length > 0 ? values.template : null,
      } as { title: string; template?: string | null };
      const updated = await updateInsight(insight.id, payload);
      if (updated) {
        // Оновлюємо форму після успішного збереження
        reset({ title: updated.title, template: updated.template ?? '' });
      }
    },
    [insight, reset, updateInsight]
  );

  const titleValue = watch('title');
  const templateValue = watch('template');

  return {
    register,
    handleSubmit,
    setValue,
    isDirty,
    isSubmitting,
    titleValue,
    templateValue,
    handleTitleUpdate,
    onSubmit,
  };
};
