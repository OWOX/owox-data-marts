jest.mock('../../../../../idp/facades/idp-projections.facade', () => ({
  IdpProjectionsFacade: jest.fn(),
}));
import { z } from 'zod-v4';
import { SetupAuthorizationService } from '../../../setup/setup-authorization.service';
import type { McpAuthContext } from '../../../auth/mcp-auth-context';
import { CreateContextTool } from './create-context.tool';
import { UpdateContextTool } from './update-context.tool';
import { SetEntityContextsTool } from './set-entity-contexts.tool';
import { SetContextMembersTool } from './set-context-members.tool';
import { SetMemberContextScopeTool } from './set-member-context-scope.tool';
import { SetContextDefaultsTool } from './set-context-defaults.tool';
import { DeleteContextTool } from './delete-context.tool';
const auth = {
  projectId: 'p',
  userId: 'u',
  roles: ['viewer'],
  scopes: ['mcp:read', 'mcp:write'],
} as McpAuthContext;
const precondition = { expectedRevision: 1, impactDigest: 'a'.repeat(64) };
const cases = [
  {
    Tool: CreateContextTool,
    action: 'create_context',
    input: { name: 'Marketing', operationId: 'same-create' },
  },
  {
    Tool: UpdateContextTool,
    action: 'update_context',
    input: { contextId: 'c', description: 'Patch', ...precondition },
  },
  {
    Tool: SetEntityContextsTool,
    action: 'set_entity_contexts',
    input: { entityType: 'CREDENTIAL', entityId: 'credential', contextIds: [], ...precondition },
  },
  {
    Tool: SetContextMembersTool,
    action: 'set_context_members',
    input: { contextId: 'c', assignedUserIds: [], ...precondition },
  },
  {
    Tool: SetMemberContextScopeTool,
    action: 'set_member_context_scope',
    input: { memberId: 'member', roleScope: 'selected_contexts', contextIds: [], ...precondition },
  },
  {
    Tool: SetContextDefaultsTool,
    action: 'set_context_defaults',
    input: { roleScope: 'selected_contexts', contextIds: ['c'], ...precondition },
  },
  {
    Tool: DeleteContextTool,
    action: 'delete_context',
    input: { contextId: 'c', operationId: 'same-delete', ...precondition },
  },
];
function build(Tool: (typeof cases)[number]['Tool']) {
  const idp = {
    getProjectForUser: jest.fn().mockResolvedValue({ id: 'p', roles: ['admin'], status: 'active' }),
  };
  const facade = {
    mutate: jest.fn().mockResolvedValue({
      resourceId: 'c',
      revision: 2,
      revisionAggregate: 'project_context_configuration',
      state: 'completed',
    }),
  };
  return {
    idp,
    facade,
    tool: new Tool(new SetupAuthorizationService(idp as never), facade as never),
  };
}
describe('Context mutation tool boundaries', () => {
  it.each(cases)(
    '$action uses the refreshed actor and strict typed outcome',
    async ({ Tool, action, input }) => {
      const state = build(Tool);
      const result = await state.tool.handler(input as never, auth);
      expect(state.facade.mutate).toHaveBeenCalledWith(
        { projectId: 'p', userId: 'u', roles: ['admin'] },
        { action, ...input }
      );
      expect(() =>
        z.object(state.tool.outputSchema).strict().parse(result.structuredContent)
      ).not.toThrow();
      expect(state.tool.requiredScopes).toEqual(['mcp:read', 'mcp:write']);
    }
  );
  it.each(cases)(
    '$action refuses missing scopes, revoked authority, and injected actor fields',
    async ({ Tool, input }) => {
      const state = build(Tool);
      await expect(
        state.tool.handler(input as never, { ...auth, scopes: ['mcp:read'] })
      ).rejects.toThrow();
      await expect(
        state.tool.handler({ ...input, projectId: 'other' } as never, auth)
      ).rejects.toThrow();
      state.idp.getProjectForUser.mockResolvedValue({
        id: 'p',
        roles: ['viewer'],
        status: 'active',
      });
      await expect(state.tool.handler(input as never, auth)).rejects.toThrow();
      expect(state.facade.mutate).not.toHaveBeenCalled();
    }
  );
  it.each(cases.filter(row => row.action !== 'create_context'))(
    '$action requires an integer revision and reviewed impact',
    async ({ Tool, input }) => {
      const state = build(Tool);
      await expect(
        state.tool.handler({ ...input, expectedRevision: undefined } as never, auth)
      ).rejects.toThrow();
      await expect(
        state.tool.handler({ ...input, expectedRevision: 1.5 } as never, auth)
      ).rejects.toThrow();
      await expect(
        state.tool.handler({ ...input, impactDigest: undefined } as never, auth)
      ).rejects.toThrow();
      expect(state.facade.mutate).not.toHaveBeenCalled();
    }
  );
  it.each(cases.filter(row => ['create_context', 'delete_context'].includes(row.action)))(
    '$action preserves caller identity and requires operationId',
    async ({ Tool, input }) => {
      const state = build(Tool);
      await expect(
        state.tool.handler({ ...input, operationId: undefined } as never, auth)
      ).rejects.toThrow();
      await state.tool.handler(input as never, auth);
      await state.tool.handler(input as never, auth);
      expect(state.facade.mutate.mock.calls[0][1].operationId).toBe(
        state.facade.mutate.mock.calls[1][1].operationId
      );
    }
  );
});
