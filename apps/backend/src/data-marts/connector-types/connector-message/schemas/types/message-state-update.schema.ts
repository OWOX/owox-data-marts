import { z } from 'zod';
import { ConnectorMessageType } from '../../../enums/connector-message-type-enum';

/**
 * Keys the backend writes itself. `date` is the incremental cursor: it must only move through
 * REQUESTED_DATE, which skips manual backfills, so a connector may not smuggle it in here.
 */
const BACKEND_OWNED_STATE_KEYS: readonly string[] = ['date'];

/**
 * Connector-owned state keys to merge into the per-configuration connector state,
 * e.g. `{ shortLinks: { [originalUrl]: [resolvedUrl, resolvedAtMs] } }`.
 */
export const MessageStateUpdateSchema = z.object({
  type: z.literal(ConnectorMessageType.STATE_UPDATE),
  at: z.string(),
  state: z
    .record(z.string(), z.unknown())
    .refine(state => !BACKEND_OWNED_STATE_KEYS.some(key => key in state), {
      message: `state must not contain backend-owned keys: ${BACKEND_OWNED_STATE_KEYS.join(', ')}`,
    }),
});

export type MessageStateUpdate = z.infer<typeof MessageStateUpdateSchema>;
