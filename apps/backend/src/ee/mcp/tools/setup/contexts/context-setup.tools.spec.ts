jest.mock('../../../../../idp/facades/idp-projections.facade', () => ({
  IdpProjectionsFacade: jest.fn(),
}));
import { ForbiddenException } from '@nestjs/common';
import { z } from 'zod-v4';
import { SetupAuthorizationService } from '../../../setup/setup-authorization.service';
import type { McpAuthContext } from '../../../auth/mcp-auth-context';
import { GetContextSetupTool } from './get-context-setup.tool';
import { ListContextResourcesTool } from './list-context-resources.tool';
import { ListSetupProjectMembersTool } from './list-setup-project-members.tool';
import { GetContextDefaultsTool } from './get-context-defaults.tool';
import { GetContextImpactTool } from './get-context-impact.tool';

const auth: McpAuthContext = {
  userId: 'actor',
  projectId: 'project',
  roles: ['admin'],
  scopes: ['mcp:read'],
} as McpAuthContext;
const defaults = {
  roleScope: 'selected_contexts',
  contextIds: ['context'],
  revision: 1,
  revisionAggregate: 'project_context_configuration',
  effect: 'new_members_only',
};
const setup = {
  id: 'context',
  name: 'Marketing',
  description: null,
  revision: 1,
  revisionAggregate: 'project_context_configuration',
  actions: { canEdit: false, canManageMembers: false, canInspectImpact: false },
  resources: [],
  memberAssignments: null,
};
const impact = {
  contextId: 'context',
  impactDigest: 'digest',
  revision: 1,
  revisionAggregate: 'project_context_configuration',
  blockers: {
    dataMartCount: 0,
    storageCount: 0,
    destinationCount: 0,
    credentialCount: 0,
    memberCount: 0,
    userProvisioningDefaultsCount: 0,
  },
  affectedMemberIds: [],
  detached: true,
  requiredActions: [],
};

function build() {
  const idp = {
    getProjectForUser: jest
      .fn()
      .mockResolvedValue({ id: 'project', status: 'active', roles: ['editor'] }),
  };
  const authorization = new SetupAuthorizationService(idp as never);
  const facade = {
    getContext: jest.fn().mockResolvedValue(setup),
    listResources: jest.fn().mockResolvedValue([]),
    listMembers: jest.fn().mockResolvedValue([]),
    getDefaults: jest.fn().mockResolvedValue(defaults),
    getImpact: jest.fn().mockResolvedValue(impact),
  };
  return {
    idp,
    facade,
    tools: [
      new GetContextSetupTool(authorization, facade as never),
      new ListContextResourcesTool(authorization, facade as never),
      new ListSetupProjectMembersTool(authorization, facade as never),
      new GetContextDefaultsTool(authorization, facade as never),
      new GetContextImpactTool(authorization, facade as never),
    ],
  };
}

const cases = [
  { index: 0, input: { contextId: 'context' }, method: 'getContext' },
  { index: 1, input: {}, method: 'listResources' },
  { index: 2, input: {}, method: 'listMembers' },
  { index: 3, input: {}, method: 'getDefaults' },
  { index: 4, input: { contextId: 'context' }, method: 'getImpact' },
] as const;

describe('Context Setup tools', () => {
  it.each(cases)(
    '$method checks direct-call admission and uses refreshed actor roles',
    async ({ index, input, method }) => {
      const s = build();
      const tool = s.tools[index];
      const result = await tool.handler(input as never, auth);
      expect(s.facade[method].mock.calls[0][0]).toEqual({
        userId: 'actor',
        projectId: 'project',
        roles: ['editor'],
      });
      expect(() =>
        z.object(tool.outputSchema).strict().parse(result.structuredContent)
      ).not.toThrow();
      expect(tool.requiredScopes).toEqual(['mcp:read']);
      expect(tool.annotations.readOnlyHint).toBe(true);
      s.idp.getProjectForUser.mockResolvedValue({
        id: 'project',
        status: 'active',
        roles: ['viewer'],
      });
      await expect(tool.handler(input as never, auth)).rejects.toThrow(ForbiddenException);
      expect(s.facade[method]).toHaveBeenCalledTimes(1);
    }
  );

  it.each(cases)(
    '$method refuses insufficient scopes before domain work',
    async ({ index, input, method }) => {
      const s = build();
      await expect(
        s.tools[index].handler(input as never, { ...auth, scopes: ['mcp:write'] })
      ).rejects.toThrow(ForbiddenException);
      expect(s.facade[method]).not.toHaveBeenCalled();
    }
  );

  it.each(cases)(
    '$method rejects model supplied actor or unknown input fields',
    async ({ index, input, method }) => {
      const s = build();
      await expect(
        s.tools[index].handler({ ...input, projectId: 'foreign' } as never, auth)
      ).rejects.toThrow();
      expect(s.facade[method]).not.toHaveBeenCalled();
    }
  );

  it.each([0, -1, 101])('rejects invalid discovery page size %s', async limit => {
    const s = build();
    await expect(s.tools[1].handler({ limit } as never, auth)).rejects.toThrow();
    expect(s.facade.listResources).not.toHaveBeenCalled();
  });
});
