import { z } from 'zod';
import { ReportCondition } from '../../../enums/report-condition.enum';
import { TemplateSourceSchema } from './template-source.schema';

export const EmailConfigType = 'email-config';

/**
 * Legacy email config schema (for backward compatibility)
 * Used for migrating old reports that have messageTemplate instead of templateSource
 */
export const LegacyEmailConfigSchema = z.object({
  type: z.literal(EmailConfigType),
  subject: z.string().nonempty('Subject is required'),
  messageTemplate: z.string().nonempty('Message template is required'),
  reportCondition: z.nativeEnum(ReportCondition),
  // Explicitly ensure templateSource is not present for legacy configs
  templateSource: z.undefined().optional(),
});

export const EmailConfigSchema = z.object({
  type: z.literal(EmailConfigType),
  subject: z.string().nonempty('Subject is required'),
  templateSource: TemplateSourceSchema,
  reportCondition: z.nativeEnum(ReportCondition),
});

// Union schema for backward compatibility - accepts both old and new formats
// Try new format first, then legacy format
export const EmailConfigInputSchema = z.union([
  EmailConfigSchema,
  LegacyEmailConfigSchema.transform(legacy => ({
    type: legacy.type,
    subject: legacy.subject,
    reportCondition: legacy.reportCondition,
    templateSource: {
      type: 'CUSTOM_MESSAGE' as const,
      config: {
        messageTemplate: legacy.messageTemplate,
      },
    },
  })),
]);

export type EmailConfig = z.infer<typeof EmailConfigSchema>;
export type LegacyEmailConfig = z.infer<typeof LegacyEmailConfigSchema>;
