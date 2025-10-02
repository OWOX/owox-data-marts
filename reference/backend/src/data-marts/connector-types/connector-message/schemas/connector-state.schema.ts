import { z } from 'zod';

export const ConnectorOutputStateSchema = z.object({
  state: z.record(z.string(), z.unknown()),
  at: z.string(),
});
