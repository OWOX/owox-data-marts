import { describe, expect, it } from 'vitest';
import {
  buildProjectRequestAccessPath,
  getSafeProjectRedirect,
  isProjectRequestAccessPath,
} from './request-access-routing';

describe('request access routing', () => {
  it('builds project-scoped request access path with redirect target', () => {
    expect(
      buildProjectRequestAccessPath('project-1', '/ui/project-1/data-marts/create?draft=1')
    ).toBe(
      '/ui/project-1/request-access?redirect-to=%2Fui%2Fproject-1%2Fdata-marts%2Fcreate%3Fdraft%3D1'
    );
  });

  it('detects project-scoped request access path', () => {
    expect(isProjectRequestAccessPath('/ui/project-1/request-access', 'project-1')).toBe(true);
    expect(isProjectRequestAccessPath('/ui/project-1/data-marts', 'project-1')).toBe(false);
  });

  it('returns only same-project redirects outside request access page', () => {
    expect(
      getSafeProjectRedirect(
        '?redirect-to=%2Fui%2Fproject-1%2Fdata-marts%2Fcreate%3Fdraft%3D1',
        'project-1'
      )
    ).toBe('/ui/project-1/data-marts/create?draft=1');
    expect(getSafeProjectRedirect('?redirect-to=%2Fui%2Fproject-1', 'project-1')).toBe(
      '/ui/project-1'
    );
    expect(
      getSafeProjectRedirect('?redirect-to=%2Fui%2Fother-project%2Fdata-marts', 'project-1')
    ).toBeNull();
    expect(
      getSafeProjectRedirect('?redirect-to=%2Fui%2Fproject-1%2Frequest-access', 'project-1')
    ).toBeNull();
  });
});
