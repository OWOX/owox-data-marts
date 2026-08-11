import { z } from 'zod';
import { ConnectorMessageType } from '../../../enums/connector-message-type-enum';

export const MessageCredentialsUpdateSchema = z.object({
  type: z.literal(ConnectorMessageType.CREDENTIALS_UPDATE),
  at: z.string(),
  eventType: z.string().optional(),
  credentials: z.record(z.string(), z.unknown()),
});

export type MessageCredentialsUpdate = z.infer<typeof MessageCredentialsUpdateSchema>;
