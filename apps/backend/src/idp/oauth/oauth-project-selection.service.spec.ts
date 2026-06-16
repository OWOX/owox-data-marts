import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import type { IdpProvider, Projects } from '@owox/idp-protocol';
import { OAuthProjectSelectionService } from './oauth-project-selection.service';
import type { AuthorizationContext } from '../types';

describe('OAuthProjectSelectionService', () => {
  const service = new OAuthProjectSelectionService();
  const context: AuthorizationContext = {
    userId: 'user-1',
    projectId: 'project-current',
    roles: ['viewer'],
    email: 'user@example.com',
    fullName: 'User One',
    avatar: 'https://example.com/avatar.png',
  };
  const projects: Projects = [
    {
      id: 'project-current',
      title: 'Current project',
      status: 'active',
      roles: ['viewer'],
      createdAt: '2026-06-01 12:30:45',
    },
    {
      id: 'project-selected',
      title: 'Selected project',
      status: 'blocked',
      roles: ['admin'],
      createdAt: '2026-06-02 08:15:00',
    },
  ];

  function createProvider() {
    return {
      getProjects: jest.fn().mockResolvedValue(projects),
      getProjectMembers: jest.fn().mockResolvedValue([
        {
          userId: 'user-1',
          email: 'selected@example.com',
          fullName: 'Selected User',
          avatar: 'https://example.com/selected.png',
          projectRole: 'admin',
          userStatus: 'active',
          hasNotificationsEnabled: true,
          isOutbound: false,
        },
      ]),
    } as unknown as jest.Mocked<Pick<IdpProvider, 'getProjects' | 'getProjectMembers'>>;
  }

  it('normalizes raw access tokens when loading projects', async () => {
    const provider = createProvider();

    await expect(service.loadProjects(provider as IdpProvider, 'access-token')).resolves.toEqual(
      projects
    );

    expect(provider.getProjects).toHaveBeenCalledWith('Bearer access-token');
  });

  it('leaves existing bearer access tokens unchanged when loading projects', async () => {
    const provider = createProvider();

    await service.loadProjects(provider as IdpProvider, 'Bearer access-token');

    expect(provider.getProjects).toHaveBeenCalledWith('Bearer access-token');
  });

  it('uses current auth context when the selected project is the current project', async () => {
    const provider = createProvider();

    const result = await service.resolveSelectedProjectMember(
      provider as IdpProvider,
      context,
      projects,
      'project-current'
    );

    expect(result).toEqual({
      userId: 'user-1',
      projectId: 'project-current',
      roles: ['viewer'],
      email: 'user@example.com',
      fullName: 'User One',
      avatar: 'https://example.com/avatar.png',
    });
    expect(provider.getProjectMembers).not.toHaveBeenCalled();
  });

  it('uses project list roles for a different selected project without loading all members', async () => {
    const provider = createProvider();

    const result = await service.resolveSelectedProjectMember(
      provider as IdpProvider,
      context,
      projects,
      'project-selected'
    );

    expect(result).toEqual({
      userId: 'user-1',
      projectId: 'project-selected',
      roles: ['admin'],
      email: 'user@example.com',
      fullName: 'User One',
      avatar: 'https://example.com/avatar.png',
    });
    expect(provider.getProjectMembers).not.toHaveBeenCalled();
  });

  it('falls back to project members when a different selected project has no project list roles', async () => {
    const provider = createProvider();

    const result = await service.resolveSelectedProjectMember(
      provider as IdpProvider,
      context,
      [
        { id: 'project-current', title: 'Current project', status: 'active' },
        { id: 'project-selected', title: 'Selected project', status: 'blocked' },
      ],
      'project-selected'
    );

    expect(provider.getProjectMembers).toHaveBeenCalledWith('project-selected', {
      forceFresh: true,
    });
    expect(result).toEqual({
      userId: 'user-1',
      projectId: 'project-selected',
      roles: ['admin'],
      email: 'selected@example.com',
      fullName: 'Selected User',
      avatar: 'https://example.com/selected.png',
    });
  });

  it('rejects selected projects outside the user project list', async () => {
    const provider = createProvider();

    await expect(
      service.resolveSelectedProjectMember(
        provider as IdpProvider,
        context,
        projects,
        'project-other'
      )
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects removed projects even if an upstream list contains them', async () => {
    const provider = createProvider();

    await expect(
      service.resolveSelectedProjectMember(
        provider as IdpProvider,
        context,
        [
          { id: 'project-current', title: 'Current project', status: 'active', roles: ['viewer'] },
          { id: 'project-removed', title: 'Removed project', status: 'removed', roles: ['admin'] },
        ],
        'project-removed'
      )
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects selected projects where the user is not an active member', async () => {
    const provider = createProvider();
    provider.getProjectMembers.mockResolvedValueOnce([
      {
        userId: 'user-1',
        email: 'selected@example.com',
        projectRole: 'viewer',
        userStatus: 'blocked',
        hasNotificationsEnabled: true,
        isOutbound: false,
      },
    ]);

    await expect(
      service.resolveSelectedProjectMember(
        provider as IdpProvider,
        context,
        [
          { id: 'project-current', title: 'Current project', status: 'active' },
          { id: 'project-selected', title: 'Selected project', status: 'blocked' },
        ],
        'project-selected'
      )
    ).rejects.toThrow(UnauthorizedException);
  });

  it('renders a centered project selection dialog with project statuses', () => {
    const html = service.renderSelectionPage({
      authorizationRequest: {
        clientId: 'client-1',
        redirectUri: 'http://127.0.0.1:5555/callback',
        resource: 'http://localhost:3000/mcp',
        scopes: ['mcp:read', 'mcp:write'],
        state: 'state-1',
        codeChallenge: 'challenge',
        codeChallengeMethod: 'S256',
      },
      projects,
      currentProjectId: 'project-current',
    });

    expect(html).toContain('<form method="get" action="/oauth/authorize">');
    expect(html).toContain('Select project (2)');
    expect(html).toContain('name="selected_project_id"');
    expect(html).toContain('Current project');
    expect(html).toContain('Blocked');
    expect(html).toContain('Business User');
    expect(html).toContain('Project Admin');
    expect(html).toContain('Jun 2, 2026');
    expect(html).toContain('max-height: 280px');
    expect(html).toContain('--primary: oklch(0.6179 0.2295 250.87)');
    expect(html).toContain('accent-color: var(--primary)');
    expect(html).toContain('background: var(--primary)');
    expect(html).toContain('id="project-search"');
    expect(html).toContain('placeholder="Search"');
    expect(html).toContain('data-project-row');
    expect(html).toContain(
      'data-search="current project project-current business user active jun 1, 2026"'
    );
    expect(html).toContain('id="project-radio-0"');
    expect(html).toContain('for="project-radio-0"');
    expect(html).toContain('class="cell-label"');
    expect(html).toContain('No projects found');
    expect(html).toContain("searchInput?.addEventListener('input'");
    expect(html).toContain('row.hidden = !visible');
    expect(html).toContain('class="spinner"');
    expect(html).toContain("form.dataset.submitting = 'true'");
    expect(html).toContain("form.setAttribute('aria-busy', 'true')");
    expect(html).toContain('submitButton.disabled = true');
    expect(html).toContain('value="project-current" checked');
    expect(html).toContain('Next');
  });

  it('does not render removed projects as selectable', () => {
    const html = service.renderSelectionPage({
      authorizationRequest: {
        clientId: 'client-1',
        redirectUri: 'http://127.0.0.1:5555/callback',
        resource: 'http://localhost:3000/mcp',
        scopes: ['mcp:read', 'mcp:write'],
        state: 'state-1',
        codeChallenge: 'challenge',
        codeChallengeMethod: 'S256',
      },
      projects: [
        { id: 'project-current', title: 'Current project', status: 'active', roles: ['viewer'] },
        { id: 'project-removed', title: 'Removed project', status: 'removed', roles: ['admin'] },
      ],
      currentProjectId: 'project-current',
    });

    expect(html).toContain('Select project (1)');
    expect(html).toContain('Current project');
    expect(html).not.toContain('Removed project');
    expect(html).not.toContain('value="project-removed"');
  });
});
