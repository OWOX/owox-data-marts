import { z } from 'zod';
import { ConnectorMessageType } from '../../../enums/connector-message-type-enum';

export const MessageErrorSchema = z.object({
  type: z.literal(ConnectorMessageType.ERROR),
  at: z.string(),
  error: z.string(),
});

export type MessageError = z.infer<typeof MessageErrorSchema>;
