import { describe, expect, it } from 'vitest';
import { getProjectIdFromPath } from '../features/idp/utils/project-id';
import { PROJECT_PLACEHOLDER, resolveProjectPlaceholder } from './path';

describe('resolveProjectPlaceholder', () => {
  it('replaces the placeholder project and keeps search and hash', () => {
    expect(resolveProjectPlaceholder('/ui/none/plugins/p1?utm_source=owox.com#x', '42')).toBe(
      '/ui/42/plugins/p1?utm_source=owox.com#x'
    );
  });

  it('handles the bare placeholder root', () => {
    expect(resolveProjectPlaceholder('/ui/none', '42')).toBe('/ui/42');
    expect(resolveProjectPlaceholder('/ui/none?x=1', '42')).toBe('/ui/42?x=1');
  });

  it('leaves every other path alone', () => {
    expect(resolveProjectPlaceholder('/ui/7/plugins', '42')).toBe('/ui/7/plugins');
    expect(resolveProjectPlaceholder('/ui/nonesuch/plugins', '42')).toBe('/ui/nonesuch/plugins');
    expect(resolveProjectPlaceholder('/p/none/settings', '42')).toBe('/p/none/settings');
  });

  it('never reads the placeholder as a project id', () => {
    expect(PROJECT_PLACEHOLDER).toBe('none');
    expect(getProjectIdFromPath('/ui/none/plugins/p1')).toBeNull();
    expect(getProjectIdFromPath('/ui/7/plugins')).toBe('7');
  });
});
