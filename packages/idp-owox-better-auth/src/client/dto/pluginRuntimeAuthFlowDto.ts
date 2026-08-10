import { z } from 'zod';

export const PluginRuntimeAuthFlowRequestSchema = z.object({
  projectId: z.string().min(1),
  userId: z.string().min(1),
  pluginId: z.string().min(1),
  installationId: z.string().min(1),
});

export type PluginRuntimeAuthFlowRequest = z.infer<typeof PluginRuntimeAuthFlowRequestSchema>;

export const PluginRuntimeAuthFlowResponseSchema = z.object({
  accessToken: z.string().min(1),
  accessTokenExpiresIn: z.number().positive(),
});

export type PluginRuntimeAuthFlowResponse = z.infer<typeof PluginRuntimeAuthFlowResponseSchema>;
