import { z } from 'zod';

export const NotificationQueuePayloadSchema = z.object({
  dataMartTitle: z.string().optional(),
  projectTitle: z.string().optional(),
  runStatus: z.string().optional(),
  errors: z.array(z.unknown()).optional(),
  rowsProcessed: z.number().optional(),
  durationMs: z.number().optional(),
  creatorUserId: z.string().optional(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  creditsUsed: z.number().optional(),
  creditsLimit: z.number().optional(),
  connectorName: z.string().optional(),
  dataMartRunType: z.string().optional(),
});

export type NotificationQueuePayload = z.infer<typeof NotificationQueuePayloadSchema>;
