import { z } from 'zod';
import { ConnectorMessageType } from '../../../enums/connector-message-type-enum';

export const MessageWarningSchema = z.object({
  type: z.literal(ConnectorMessageType.WARNING),
  at: z.string(),
  warning: z.string(),
});

export type MessageWarning = z.infer<typeof MessageWarningSchema>;
