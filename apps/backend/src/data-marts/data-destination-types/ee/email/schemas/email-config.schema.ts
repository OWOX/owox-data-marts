import { z } from 'zod';
import { ReportCondition } from '../../../enums/report-condition.enum';

export const EmailConfigType = 'email-config';

export const EmailConfigSchema = z.object({
  type: z.literal(EmailConfigType),
  subject: z.string().nonempty('Subject is required'),
  messageTemplate: z.string().nonempty('Message template is required'),
  reportCondition: z.nativeEnum(ReportCondition),
});

export type EmailConfig = z.infer<typeof EmailConfigSchema>;
