import { UnauthorizedException } from '@nestjs/common';
import type { Project } from '@owox/idp-protocol';
import { IdpProjectionsFacade } from './idp-projections.facade';
import { McpProjectContextFacadeImpl } from './mcp-project-context.facade.impl';

describe('McpProjectContextFacadeImpl', () => {
  const project: Project = {
    id: 'project-1',
    title: 'Main Project',
    status: 'active',
    roles: ['admin'],
    createdAt: '2026-06-01 12:30:45',
  };

  function createFacade() {
    const idpProjectionsFacade = {
      getProjectForUser: jest.fn().mockResolvedValue(project),
    } as unknown as jest.Mocked<Pick<IdpProjectionsFacade, 'getProjectForUser'>>;

    return {
      facade: new McpProjectContextFacadeImpl(idpProjectionsFacade as IdpProjectionsFacade),
      idpProjectionsFacade,
    };
  }

  it('returns current MCP project metadata from the IDP projection', async () => {
    const { facade, idpProjectionsFacade } = createFacade();

    await expect(
      facade.getProjectContext({
        userId: 'user-1',
        projectId: 'project-1',
        roles: ['viewer'],
      })
    ).resolves.toEqual({
      project: {
        id: 'project-1',
        title: 'Main Project',
        status: 'active',
        roles: ['admin'],
        createdAt: '2026-06-01 12:30:45',
      },
    });
    expect(idpProjectionsFacade.getProjectForUser).toHaveBeenCalledWith('user-1', 'project-1');
  });

  it('rejects MCP context when upstream returns a different project', async () => {
    const { facade, idpProjectionsFacade } = createFacade();
    idpProjectionsFacade.getProjectForUser.mockResolvedValueOnce({
      ...project,
      id: 'project-other',
    });

    await expect(
      facade.getProjectContext({
        userId: 'user-1',
        projectId: 'project-1',
        roles: ['viewer'],
      })
    ).rejects.toThrow(UnauthorizedException);
  });
});
