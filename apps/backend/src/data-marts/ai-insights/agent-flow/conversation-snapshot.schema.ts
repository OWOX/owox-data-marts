import { z } from 'zod';

export const AgentFlowConversationSnapshotContentSchema = z.object({
  goal: z.string().nullable(),
  decisions: z.array(z.string()),
  appliedChanges: z.array(z.string()),
  openQuestions: z.array(z.string()),
  importantFacts: z.array(z.string()),
  lastUserIntent: z.string().nullable(),
});

export type AgentFlowConversationSnapshotContent = z.infer<
  typeof AgentFlowConversationSnapshotContentSchema
>;

export const AgentFlowConversationSnapshotSchema =
  AgentFlowConversationSnapshotContentSchema.extend({
    compressedTurns: z.number().int().nonnegative(),
    updatedAt: z.string().min(1),
  });

export type AgentFlowConversationSnapshot = z.infer<typeof AgentFlowConversationSnapshotSchema>;
