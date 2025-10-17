import { z } from 'zod';

export const ConnectorStateItemSchema = z.object({
  _id: z.string(),
  state: z.record(z.string(), z.unknown()),
  at: z.string(),
});

export const ConnectorOutputStateSchema = z.object({
  state: z.record(z.string(), z.unknown()).optional(), // Deprecated: for backward compatibility
  at: z.string().optional(),
  states: z.array(ConnectorStateItemSchema).optional(), // New: array of states per configuration
});
