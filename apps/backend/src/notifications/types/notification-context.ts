import { z } from 'zod';

export const NotificationContextSchema = z.object({
  projectId: z.string(),
  projectTitle: z.string().optional(),
  userId: z.string().optional(),
});

export type NotificationContext = z.infer<typeof NotificationContextSchema>;

export const NotificationRuntimeConfigSchema = z.object({
  appUrl: z.string().url().optional(),
});

export type NotificationRuntimeConfig = z.infer<typeof NotificationRuntimeConfigSchema>;

export const NotificationEmailLimitsSchema = z.object({
  maxDataMarts: z.number().int().positive(),
  maxRunsPerDm: z.number().int().positive(),
});

export type NotificationEmailLimits = z.infer<typeof NotificationEmailLimitsSchema>;
