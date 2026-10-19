import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { Project } from '@owox/idp-protocol';
import type { IdpProjectionsFacade } from '../../idp/facades/idp-projections.facade';
import { ProjectSettingsService } from '../services/project-settings.service';
import { UpdateProjectDescriptionService } from '../use-cases/update-project-description.service';
import { ProjectSettingsMapper } from '../mappers/project-settings.mapper';
import { McpProjectSetupMapper } from '../mappers/mcp-project-setup.mapper';
import { McpProjectSetupFacadeImpl } from './mcp-project-setup.facade.impl';

describe('McpProjectSetupFacadeImpl', () => {
  const request = { projectId: 'project-1', userId: 'user-1', roles: ['admin' as const] };
  let project: Project;
  let lookup: jest.Mock;
  let settings: jest.Mock;
  let save: jest.Mock;
  let facade: McpProjectSetupFacadeImpl;

  beforeEach(() => {
    project = { id: 'project-1', title: 'Project', roles: ['admin'], status: 'active' };
    lookup = jest.fn(async () => project);
    settings = jest
      .fn()
      .mockResolvedValue({ description: '# Metrics\n\n**Revenue**: net.', revision: 4 });
    save = jest.fn(async (_projectId, description) => ({ description, revision: 5 }));
    const domain = {
      findByProjectId: settings,
      saveDescription: save,
    } as unknown as ProjectSettingsService;
    facade = new McpProjectSetupFacadeImpl(
      { getProjectForUser: lookup } as unknown as IdpProjectionsFacade,
      domain,
      new McpProjectSetupMapper(),
      new UpdateProjectDescriptionService(domain, new ProjectSettingsMapper())
    );
  });

  it('returns authoritative full Markdown and current identity and roles', async () => {
    project.roles = ['editor'];
    const result = await facade.getProjectSetup(request);
    expect(result).toEqual({
      project: {
        id: 'project-1',
        title: 'Project',
        status: 'active',
        roles: ['editor'],
        createdAt: null,
      },
      description: '# Metrics\n\n**Revenue**: net.',
      revision: 4,
      canUpdateDescription: false,
    });
    expect(lookup).toHaveBeenCalledWith('user-1', 'project-1');
    expect(settings).toHaveBeenCalledWith('project-1');
  });

  it('allows admin writes using the existing use case and preserves Markdown', async () => {
    await expect(
      facade.updateProjectDescription({
        ...request,
        description: '  # Metrics\n\n**Revenue**: net.  ',
        expectedRevision: 4,
      })
    ).resolves.toEqual({ description: '# Metrics\n\n**Revenue**: net.', revision: 5 });
    expect(save).toHaveBeenCalledWith('project-1', '# Metrics\n\n**Revenue**: net.', 4);
  });

  it('rejects editor writes at the domain boundary despite stale admin claims', async () => {
    project.roles = ['editor'];
    await expect(
      facade.updateProjectDescription({ ...request, description: 'Forbidden', expectedRevision: 4 })
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(save).not.toHaveBeenCalled();
  });

  it.each([undefined, '', '   ', 'x'.repeat(10001), ' '.repeat(10000) + 'x'])(
    'rejects invalid description in direct domain calls',
    async description => {
      await expect(
        facade.updateProjectDescription({ ...request, description, expectedRevision: 4 } as never)
      ).rejects.toThrow();
      expect(save).not.toHaveBeenCalled();
    }
  );

  it('accepts 10,000 characters and explicit null through the domain boundary', async () => {
    await facade.updateProjectDescription({
      ...request,
      description: 'x'.repeat(10000),
      expectedRevision: 4,
    });
    await facade.updateProjectDescription({ ...request, description: null, expectedRevision: 5 });
    expect(save).toHaveBeenLastCalledWith('project-1', null, 5);
  });

  it('distinguishes absent settings from a storage failure', async () => {
    settings.mockResolvedValueOnce(null);
    await expect(facade.getProjectSetup(request)).resolves.toMatchObject({ description: null });
    settings.mockRejectedValueOnce(new Error('Read failed'));
    await expect(facade.getProjectSetup(request)).rejects.toThrow('Read failed');
  });

  it.each([undefined, [], ['viewer']])(
    'rejects current roles %j without token fallback',
    async roles => {
      project.roles = roles as Project['roles'];
      await expect(facade.getProjectSetup(request)).rejects.toBeInstanceOf(ForbiddenException);
      expect(settings).not.toHaveBeenCalled();
    }
  );

  it.each(['blocked', 'removed'] as const)('rejects %s projects before storage', async status => {
    project.status = status;
    await expect(facade.getProjectSetup(request)).rejects.toBeInstanceOf(ForbiddenException);
    expect(settings).not.toHaveBeenCalled();
  });

  it('rejects a foreign project', async () => {
    project.id = 'foreign-project';
    await expect(facade.getProjectSetup(request)).rejects.toBeInstanceOf(ForbiddenException);
    expect(settings).not.toHaveBeenCalled();
  });

  it('rejects missing actor before any lookup', async () => {
    await expect(facade.getProjectSetup({ ...request, userId: ' ' })).rejects.toBeInstanceOf(
      UnauthorizedException
    );
    expect(lookup).not.toHaveBeenCalled();
  });
});
