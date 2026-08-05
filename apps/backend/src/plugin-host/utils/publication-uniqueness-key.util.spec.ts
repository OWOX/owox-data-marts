import { PluginPublicationScope } from '../enums/plugin-publication-scope.enum';
import { buildUniquenessKey } from './publication-uniqueness-key.util';

describe('buildUniquenessKey', () => {
  it('identifies a deployment publication by plugin alone', () => {
    expect(buildUniquenessKey({ scope: PluginPublicationScope.DEPLOYMENT, pluginId: 'p1' })).toBe(
      'deployment:p1'
    );
  });

  it('identifies a project publication by plugin and project', () => {
    expect(
      buildUniquenessKey({
        scope: PluginPublicationScope.PROJECT,
        pluginId: 'p1',
        projectId: 'j1',
      })
    ).toBe('project:p1:j1');
  });

  it('identifies a member publication by plugin, project and member', () => {
    expect(
      buildUniquenessKey({
        scope: PluginPublicationScope.MEMBER,
        pluginId: 'p1',
        projectId: 'j1',
        userId: 'u1',
      })
    ).toBe('member:p1:j1:u1');
  });

  // Project and user ids are opaque strings from the IDP. Without escaping,
  // (project 'a', user 'b:c') and (project 'a:b', user 'c') would collide on one key --
  // and a collision here means one member's publication silently becomes another's.
  it('cannot be made ambiguous by ids containing the separator', () => {
    const first = buildUniquenessKey({
      scope: PluginPublicationScope.MEMBER,
      pluginId: 'p1',
      projectId: 'a',
      userId: 'b:c',
    });
    const second = buildUniquenessKey({
      scope: PluginPublicationScope.MEMBER,
      pluginId: 'p1',
      projectId: 'a:b',
      userId: 'c',
    });

    expect(first).not.toBe(second);
  });

  it('is stable for the same inputs', () => {
    const input = {
      scope: PluginPublicationScope.MEMBER,
      pluginId: 'p1',
      projectId: 'j1',
      userId: 'u1',
    };

    expect(buildUniquenessKey(input)).toBe(buildUniquenessKey(input));
  });

  it.each([
    [{ scope: PluginPublicationScope.PROJECT, pluginId: 'p1' }],
    [{ scope: PluginPublicationScope.MEMBER, pluginId: 'p1', projectId: 'j1' }],
    [{ scope: PluginPublicationScope.MEMBER, pluginId: 'p1', userId: 'u1' }],
  ])('refuses to build an under-specified key from %o', input => {
    expect(() => buildUniquenessKey(input)).toThrow();
  });
});
