import { z } from 'zod';
import { ConnectorMessageType } from '../../../enums/connector-message-type-enum';

export const MessageUpdateParameterSchema = z.object({
  type: z.literal(ConnectorMessageType.UPDATE_PARAMETER),
  at: z.string(),
  parameter: z.string(),
  value: z.any(),
});

export type MessageUpdateParameter = z.infer<typeof MessageUpdateParameterSchema>;
