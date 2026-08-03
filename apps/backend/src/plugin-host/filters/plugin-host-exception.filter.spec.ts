import { ArgumentsHost } from '@nestjs/common';
import { GithubRepoNotAccessibleError, PluginSuspendedError } from '../errors/plugin-host.errors';
import { PluginHostExceptionFilter } from './plugin-host-exception.filter';

function createHost() {
  const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ url: '/api/plugins/gallery' }),
    }),
  } as unknown as ArgumentsHost;

  return { host, response, body: () => response.json.mock.calls[0][0] as Record<string, unknown> };
}

describe('PluginHostExceptionFilter', () => {
  // Publisher-only errors carry GitHub paths, access modes and installation URLs. On a
  // member-facing route those are source diagnostics §16 withholds.
  it('strips detail from an error a member is not entitled to see', () => {
    const { host, response, body } = createHost();

    new PluginHostExceptionFilter().catch(
      new GithubRepoNotAccessibleError(
        'OWOX',
        'private-repo',
        'https://github.com/apps/owox/installations/new'
      ),
      host
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(body()).not.toHaveProperty('errorDetails');
    expect(JSON.stringify(body())).not.toContain('installations/new');
    expect(JSON.stringify(body())).not.toContain('private-repo');
  });

  it('keeps a stable code so clients can still branch on the failure', () => {
    const { host, body } = createHost();

    new PluginHostExceptionFilter().catch(
      new GithubRepoNotAccessibleError(
        'OWOX',
        'x',
        'https://github.com/apps/owox/installations/new'
      ),
      host
    );

    expect(body().code).toBe('GITHUB_REPO_NOT_ACCESSIBLE');
  });

  it('passes a member-visible error through untouched', () => {
    const { host, body } = createHost();

    new PluginHostExceptionFilter().catch(new PluginSuspendedError('p1'), host);

    expect(body()).toMatchObject({
      code: 'PLUGIN_SUSPENDED',
      errorDetails: { pluginId: 'p1' },
    });
  });
});
