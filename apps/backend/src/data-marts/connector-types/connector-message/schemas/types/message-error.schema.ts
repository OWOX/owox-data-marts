import { z } from 'zod';
import { ConnectorMessageType } from '../../../enums/connector-message-type-enum';

export const MessageErrorSchema = z.object({
  type: z.literal(ConnectorMessageType.ERROR),
  at: z.string(),
  eventType: z.string().optional(),
  error: z.string(),
});

export type MessageError = z.infer<typeof MessageErrorSchema>;
