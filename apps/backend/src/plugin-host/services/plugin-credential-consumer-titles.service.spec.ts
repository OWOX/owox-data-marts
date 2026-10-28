import type { AuthorizationContext } from '../../idp';
import { PluginCredentialConsumerTitlesService } from './plugin-credential-consumer-titles.service';

const installations = [
  { id: 'own', pluginId: 'slack', projectId: 'p1', userId: 'member-1' },
  { id: 'colleague', pluginId: 'jira', projectId: 'p1', userId: 'member-2' },
  { id: 'elsewhere', pluginId: 'slack', projectId: 'p2', userId: 'member-1' },
];

function setup() {
  const consumerTitles = { register: jest.fn() };
  const installationService = {
    findByIds: jest.fn(async (ids: readonly string[]) =>
      installations.filter(row => ids.includes(row.id))
    ),
  };
  const plugins = {
    findByIds: jest.fn(async (ids: readonly string[]) =>
      ids.map(id => ({ id, currentVersionId: `${id}-v1` }))
    ),
  };
  const versions = {
    findByIds: jest.fn(async (ids: readonly string[]) => ids.map(id => ({ id }))),
  };
  const mapper = {
    displayNameOf: jest.fn((plugin: { id: string }) => `${plugin.id} plugin`),
  };
  const service = new PluginCredentialConsumerTitlesService(
    consumerTitles as never,
    installationService as never,
    plugins as never,
    versions as never,
    mapper as never
  );
  return { service, consumerTitles, installationService, plugins };
}

const member = { projectId: 'p1', userId: 'member-1', roles: ['editor'] } as AuthorizationContext;

describe('PluginCredentialConsumerTitlesService', () => {
  it('titles only the member’s own installations in the project', async () => {
    const state = setup();

    await expect(
      state.service.visibleTitles(member, ['own', 'colleague', 'elsewhere'])
    ).resolves.toEqual(new Map([['own', 'slack plugin']]));
  });

  it('titles every installation in the project for an admin', async () => {
    const state = setup();

    await expect(
      state.service.visibleTitles({ ...member, roles: ['admin'] }, [
        'own',
        'colleague',
        'elsewhere',
      ])
    ).resolves.toEqual(
      new Map([
        ['own', 'slack plugin'],
        ['colleague', 'jira plugin'],
      ])
    );
  });

  it('reads no plugin when the member can see none of the installations', async () => {
    const state = setup();

    await expect(state.service.visibleTitles(member, ['colleague'])).resolves.toEqual(new Map());
    expect(state.plugins.findByIds).not.toHaveBeenCalled();
  });

  it('registers itself for plugin-installation consumers', async () => {
    const state = setup();
    state.service.onModuleInit();
    const [[consumerType, lookup]] = state.consumerTitles.register.mock.calls;

    expect(consumerType).toBe('plugin-installation');
    await expect(lookup(member, ['own'])).resolves.toEqual(new Map([['own', 'slack plugin']]));
  });
});
