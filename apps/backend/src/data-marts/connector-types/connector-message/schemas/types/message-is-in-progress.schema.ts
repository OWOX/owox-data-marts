import { z } from 'zod';
import { ConnectorMessageType } from '../../../enums/connector-message-type-enum';

export const MessageIsInProgressSchema = z.object({
  type: z.literal(ConnectorMessageType.IS_IN_PROGRESS),
  at: z.string(),
  status: z.string(),
});

export type MessageIsInProgress = z.infer<typeof MessageIsInProgressSchema>;
