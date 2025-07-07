import { z } from 'zod';
import { ConnectorMessageType } from '../../../enums/connector-message-type-enum';

export const MessageStateSchema = z.object({
  type: z.literal(ConnectorMessageType.STATE),
  at: z.string(),
  date: z.string(),
});

export type MessageState = z.infer<typeof MessageStateSchema>;
