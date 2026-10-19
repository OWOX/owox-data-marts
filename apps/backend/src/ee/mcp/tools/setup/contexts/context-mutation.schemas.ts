import { z } from 'zod-v4';
const id = z.string().trim().min(1).max(255);
const ids = z.array(id).max(1000);
export const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const scope = z.enum(['entire_project', 'selected_contexts']);
export const contextChanges = {
  update_context: z
    .object({
      action: z.literal('update_context'),
      contextId: id,
      name: id.optional(),
      description: z.string().max(100000).nullable().optional(),
    })
    .strict(),
  set_entity_contexts: z
    .object({
      action: z.literal('set_entity_contexts'),
      entityType: z.enum(['DATA_MART', 'STORAGE', 'DESTINATION', 'CREDENTIAL']),
      entityId: id,
      contextIds: ids,
    })
    .strict(),
  set_context_members: z
    .object({ action: z.literal('set_context_members'), contextId: id, assignedUserIds: ids })
    .strict(),
  set_member_context_scope: z
    .object({
      action: z.literal('set_member_context_scope'),
      memberId: id,
      roleScope: scope,
      contextIds: ids,
    })
    .strict(),
  set_context_defaults: z
    .object({ action: z.literal('set_context_defaults'), roleScope: scope, contextIds: ids })
    .strict(),
  delete_context: z.object({ action: z.literal('delete_context'), contextId: id }).strict(),
};
export const contextChange = z.discriminatedUnion('action', [
  contextChanges.update_context,
  contextChanges.set_entity_contexts,
  contextChanges.set_context_members,
  contextChanges.set_member_context_scope,
  contextChanges.set_context_defaults,
  contextChanges.delete_context,
]);
export const mutationPrecondition = {
  expectedRevision: revision,
  impactDigest: z.string().regex(/^[a-f0-9]{64}$/),
};
export const mutationOutput = {
  outcome: z
    .object({
      resourceId: z.string(),
      revision,
      revisionAggregate: z.literal('project_context_configuration'),
      state: z.enum(['completed', 'incomplete', 'unknown']),
      deleted: z.boolean().optional(),
    })
    .strict(),
};
export const operationId = id;
