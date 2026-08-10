import { z } from 'zod';
import { ConnectorMessageType } from '../../../enums/connector-message-type-enum';

export const MessageFieldsUpdateSchema = z.object({
  type: z.literal(ConnectorMessageType.FIELDS_UPDATE),
  at: z.string(),
  fields: z.array(z.string()),
});

export type MessageFieldsUpdate = z.infer<typeof MessageFieldsUpdateSchema>;
