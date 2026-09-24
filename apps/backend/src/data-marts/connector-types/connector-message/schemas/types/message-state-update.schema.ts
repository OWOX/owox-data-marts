import { z } from 'zod';
import { ConnectorMessageType } from '../../../enums/connector-message-type-enum';

/**
 * Connector-owned state keys to merge into the per-configuration connector state,
 * e.g. `{ shortLinks: { [originalUrl]: [resolvedUrl, resolvedAtMs] } }`.
 */
export const MessageStateUpdateSchema = z.object({
  type: z.literal(ConnectorMessageType.STATE_UPDATE),
  at: z.string(),
  state: z.record(z.string(), z.unknown()),
});

export type MessageStateUpdate = z.infer<typeof MessageStateUpdateSchema>;
