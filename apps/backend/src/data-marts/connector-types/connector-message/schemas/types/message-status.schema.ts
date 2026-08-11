import { z } from 'zod';
import { ConnectorMessageType } from '../../../enums/connector-message-type-enum';

export const MessageStatusSchema = z.object({
  type: z.literal(ConnectorMessageType.STATUS),
  at: z.string(),
  eventType: z.string().optional(),
  status: z.number(),
});

export type MessageStatus = z.infer<typeof MessageStatusSchema>;
