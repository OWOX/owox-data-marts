import { z } from 'zod';
import { ConnectorMessageType } from '../../../enums/connector-message-type-enum';

export const MessageRequestedDateSchema = z.object({
  type: z.literal(ConnectorMessageType.REQUESTED_DATE),
  at: z.string(),
  requestedDate: z.string(),
});

export type MessageRequestedDate = z.infer<typeof MessageRequestedDateSchema>;
