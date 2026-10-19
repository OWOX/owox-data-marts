import { ForbiddenException } from '@nestjs/common';
import { z } from 'zod-v4';
import type { IdpProjectionsFacade } from '../../../../../idp/facades/idp-projections.facade';
import type { PublicOriginService } from '../../../../../common/config/public-origin.service';
import { McpProjectSetupFacadeImpl } from '../../../../../project-settings/facades/mcp-project-setup.facade.impl';
import { UpdateProjectDescriptionService } from '../../../../../project-settings/use-cases/update-project-description.service';
import { McpProjectSetupMapper } from '../../../../../project-settings/mappers/mcp-project-setup.mapper';
import type { ProjectSettingsService } from '../../../../../project-settings/services/project-settings.service';
import { SetupAuthorizationService } from '../../../setup/setup-authorization.service';
import type { McpAuthContext } from '../../../auth/mcp-auth-context';
import { GetProjectSetupTool } from './get-project-setup.tool';

describe('GetProjectSetupTool', () => {
  const context = {
    projectId: 'project/1',
    userId: 'user-1',
    roles: ['admin'],
    scopes: ['mcp:read', 'mcp:write'],
  } as McpAuthContext;
  let lookup: jest.Mock;
  let read: jest.Mock;
  let tool: GetProjectSetupTool;

  beforeEach(() => {
    lookup = jest
      .fn()
      .mockResolvedValue({ id: 'project/1', title: 'Current project', roles: ['admin'] });
    read = jest.fn().mockResolvedValue({ description: '# Markdown\n\nFull content', revision: 4 });
    const idp = { getProjectForUser: lookup } as unknown as IdpProjectionsFacade;
    const facade = new McpProjectSetupFacadeImpl(
      idp,
      { findByProjectId: read } as unknown as ProjectSettingsService,
      new McpProjectSetupMapper(),
      {} as UpdateProjectDescriptionService
    );
    tool = new GetProjectSetupTool(new SetupAuthorizationService(idp), facade, {
      getPublicOrigin: () => 'https://selfhost.test',
    } as PublicOriginService);
  });

  it('returns explicit identity, full nullable description, actions and actual app route', async () => {
    const result = await tool.handler({}, context);
    expect(result.structuredContent).toMatchObject({
      project: { id: 'project/1', title: 'Current project', roles: ['admin'] },
      description: '# Markdown\n\nFull content',
      revision: 4,
      can_update_description: true,
      project_settings_url: 'https://selfhost.test/ui/project%2F1/project-settings',
    });
    expect(z.object(tool.outputSchema).safeParse(result.structuredContent).success).toBe(true);
  });

  it('does not advertise a write action with only read scope', async () => {
    const result = await tool.handler({}, { ...context, scopes: ['mcp:read'] });
    expect(result.structuredContent).toMatchObject({ can_update_description: false });
  });

  it('validates strict input even when handler is called directly', async () => {
    await expect(
      tool.handler({ projectId: 'attacker-project' } as never, context)
    ).rejects.toThrow();
    expect(read).not.toHaveBeenCalled();
  });

  it('denies a direct handler invocation without read scope before storage', async () => {
    await expect(tool.handler({}, { ...context, scopes: ['mcp:write'] })).rejects.toBeInstanceOf(
      ForbiddenException
    );
    expect(read).not.toHaveBeenCalled();
  });

  it('rechecks current roles for every invocation', async () => {
    await tool.handler({}, context);
    read.mockClear();
    lookup.mockResolvedValue({ id: 'project/1', roles: ['viewer'] });
    await expect(tool.handler({}, context)).rejects.toBeInstanceOf(ForbiddenException);
    expect(read).not.toHaveBeenCalled();
  });

  it('propagates read failure instead of returning empty editable data', async () => {
    read.mockRejectedValue(new Error('Storage unavailable'));
    await expect(tool.handler({}, context)).rejects.toThrow('Storage unavailable');
  });
});
