import { z } from 'zod';
import { ConnectorMessageType } from '../../../enums/connector-message-type-enum';

export const MessageLogSchema = z.object({
  type: z.literal(ConnectorMessageType.LOG),
  at: z.string(),
  eventType: z.string().optional(),
  metric: z.string().optional(),
  value: z.unknown().optional(),
  tags: z.record(z.string(), z.unknown()).optional(),
  message: z.string(),
});

export type MessageLog = z.infer<typeof MessageLogSchema>;
