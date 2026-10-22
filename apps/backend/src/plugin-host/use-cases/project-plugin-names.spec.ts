import { PluginPresentationMapper } from '../mappers/plugin-presentation.mapper';
import { pluginNamesById, unique } from './project-plugin-names';

describe('project plugin names', () => {
  it('drops repeated ids and keeps the first-seen order', () => {
    expect(unique(['b', 'a', 'b', 'c', 'a'])).toEqual(['b', 'a', 'c']);
  });

  it('names a plugin by its current version, and leaves out one whose row is gone', async () => {
    const plugins = {
      findByIds: jest.fn(async () => [
        { id: 'p1', currentVersionId: 'v1', repoName: 'sheets', repoOwner: 'OWOX' },
      ]),
    };
    const versions = {
      findByIds: jest.fn(async () => [{ id: 'v1', displayName: 'Sheets Sync', semver: '1.0.0' }]),
    };

    const names = await pluginNamesById(
      plugins as never,
      versions as never,
      new PluginPresentationMapper(),
      ['p1', 'p2', 'p1']
    );

    expect(plugins.findByIds).toHaveBeenCalledWith(['p1', 'p2']);
    expect(versions.findByIds).toHaveBeenCalledWith(['v1']);
    expect(names).toEqual(new Map([['p1', 'Sheets Sync']]));
  });
});
