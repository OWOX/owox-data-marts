import { z } from 'zod';
import { DateTruncRuleSchema } from './date-trunc-config.schema';

/** The separate grouping at which a read checks its metric (HAVING) filters. */
export const HavingGroupBySchema = z
  .object({
    column: z.array(z.string().min(1)),
    dateTrunc: z.array(DateTruncRuleSchema).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const keys = new Set<string>();
    value.column.forEach((column, index) => {
      if (keys.has(column)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['column', index],
          message: `Key "${column}" appears more than once in "column"`,
        });
      }
      keys.add(column);
    });
    const bucketed = new Set<string>();
    value.dateTrunc?.forEach((rule, index) => {
      if (!keys.has(rule.column)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['dateTrunc', index, 'column'],
          message: `Date bucket column "${rule.column}" is not a key in "column"`,
        });
      } else if (bucketed.has(rule.column)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['dateTrunc', index, 'column'],
          message: `Key "${rule.column}" has more than one date bucket`,
        });
      }
      bucketed.add(rule.column);
    });
  });

export type HavingGroupBy = z.infer<typeof HavingGroupBySchema>;
