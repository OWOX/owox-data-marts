import { z } from 'zod';
import { ConnectorMessageType } from '../../../enums/connector-message-type-enum';

export const MessageLogSchema = z.object({
  type: z.literal(ConnectorMessageType.LOG),
  at: z.string(),
  message: z.string(),
});

export type MessageLog = z.infer<typeof MessageLogSchema>;
