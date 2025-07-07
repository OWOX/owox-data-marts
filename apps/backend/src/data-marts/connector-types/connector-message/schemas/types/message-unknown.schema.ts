import { z } from 'zod';
import { ConnectorMessageType } from '../../../enums/connector-message-type-enum';

export const MessageUnknownSchema = z.object({
  type: z.literal(ConnectorMessageType.UNKNOWN),
  at: z.string(),
  message: z.string(),
});

export type MessageUnknown = z.infer<typeof MessageUnknownSchema>;
