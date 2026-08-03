import PluginsPublish from './commands/plugins/publish.js';
import PluginsUnpublish from './commands/plugins/unpublish.js';
import PluginsUpdate, { updatePlugin, updateSummary } from './commands/plugins/update.js';
import {
  installationHint,
  publishPlugin,
  toPublishInput,
  unpublishPlugin,
} from './plugins-support.js';

const client = (calls: unknown[]) => ({
  plugins: {
    publish: async (input: unknown) => {
      calls.push(input);
      return { publicationId: 'pub1' } as never;
    },
    unpublish: async (input: unknown) => {
      calls.push(input);
      return { publicationId: 'pub1' } as never;
    },
    update: async (repository: unknown) => {
      calls.push(repository);
      return { pluginId: 'p1', updated: true } as never;
    },
  },
});

describe('plugins command flags', () => {
  // Combining the two audience forms is refused by oclif before any request leaves,
  // which is cheaper and clearer than a round trip. The server rejects it too, because
  // the CLI is not the only client.
  it.each([PluginsPublish, PluginsUnpublish])(
    '%p declares the audience forms mutually exclusive',
    command => {
      expect(command.flags['project-id'].exclusive).toContain('all-projects');
      expect(command.flags['all-projects'].exclusive).toContain('project-id');
    }
  );

  it('accepts a repeatable project id', () => {
    expect(PluginsPublish.flags['project-id'].multiple).toBe(true);
  });

  it('restricts scope to the three authority levels', () => {
    expect(PluginsPublish.flags.scope.options).toEqual(['deployment', 'project', 'member']);
  });

  // §9: the command takes no email address and no caller project id -- OWOX_API_KEY
  // already identifies the project, the member and the key.
  it('takes only a repository as its argument', () => {
    expect(Object.keys(PluginsPublish.args)).toEqual(['repository']);
  });

  it('exposes update with only a repository argument', () => {
    expect(Object.keys(PluginsUpdate.args)).toEqual(['repository']);
  });
});

describe('toPublishInput', () => {
  it('omits both audience keys when neither form is chosen', () => {
    expect(toPublishInput('OWOX/example', { scope: 'member' })).toEqual({
      repository: 'OWOX/example',
      scope: 'member',
    });
  });

  it('carries selected projects through', () => {
    expect(
      toPublishInput('OWOX/example', { scope: 'deployment', 'project-id': ['p1', 'p2'] })
    ).toEqual({ repository: 'OWOX/example', scope: 'deployment', projectIds: ['p1', 'p2'] });
  });

  it('carries the wildcard through', () => {
    expect(toPublishInput('OWOX/example', { scope: 'deployment', 'all-projects': true })).toEqual({
      repository: 'OWOX/example',
      scope: 'deployment',
      allProjects: true,
    });
  });

  it('treats an empty project list as no audience at all', () => {
    expect(toPublishInput('OWOX/example', { scope: 'deployment', 'project-id': [] })).toEqual({
      repository: 'OWOX/example',
      scope: 'deployment',
    });
  });
});

describe('publish and unpublish', () => {
  it('reach their own api-client operations', async () => {
    const publishCalls: unknown[] = [];
    const unpublishCalls: unknown[] = [];

    await publishPlugin(client(publishCalls), { repository: 'OWOX/example', scope: 'member' });
    await unpublishPlugin(client(unpublishCalls), { repository: 'OWOX/example', scope: 'member' });

    expect(publishCalls).toHaveLength(1);
    expect(unpublishCalls).toHaveLength(1);
  });
});

describe('update', () => {
  it('reaches the api-client update operation', async () => {
    const calls: unknown[] = [];

    await updatePlugin(client(calls), 'OWOX/example');

    expect(calls).toEqual(['OWOX/example']);
  });

  // Every outcome states the daily cadence, because the point of the summary is that the
  // member did not have to ask at all -- and a failed check must not read as up to date.
  it.each([
    ['updated', 'Updated to v2.0.0. It is now current for everyone using OWOX/example.'],
    ['up_to_date', 'Already on the highest eligible release, v2.0.0.'],
    ['already_running', 'A check for OWOX/example is already running; its result stands.'],
    ['failed', 'The check could not reach GitHub. v2.0.0 stays active.'],
  ])('states what %s means', (outcome, expected) => {
    const summary = updateSummary({
      pluginId: 'p1',
      repository: 'OWOX/example',
      currentVersionId: 'v1',
      currentSemver: '2.0.0',
      outcome: outcome as 'updated',
      updated: outcome === 'updated',
      nextCheckAt: '2026-08-04T03:15:00.000Z',
      diagnostics: null,
    });

    expect(summary.split('\n')[0]).toBe(expected);
    expect(summary).toContain('Updates are checked daily');
  });
});

describe('installationHint', () => {
  // The one failure a publisher can act on, and the fix is a URL the server hands back.
  it('explains how to grant access when the repository is unreadable', () => {
    const hint = installationHint({
      code: 'GITHUB_REPO_NOT_ACCESSIBLE',
      details: { installationUrl: 'https://github.com/apps/owox/installations/new' },
    });

    expect(hint).toContain('https://github.com/apps/owox/installations/new');
    expect(hint).toContain('run the same command again');
  });

  it.each([
    ['a different failure', { code: 'GITHUB_RATE_LIMITED', details: {} }],
    ['a missing url', { code: 'GITHUB_REPO_NOT_ACCESSIBLE', details: {} }],
    ['a plain error', new Error('boom')],
    ['nothing', null],
  ])('stays silent for %s', (_label, error) => {
    expect(installationHint(error)).toBeNull();
  });
});
