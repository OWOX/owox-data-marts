import { describe, expect, it } from 'vitest';
import { findReleaseIssues } from './rejections';
import type { PluginPublication } from './types';

const publication = (
  diagnostics?: PluginPublication['diagnostics'],
  overrides: Partial<PluginPublication> = {}
): PluginPublication => ({
  publicationId: 'pub-1',
  pluginId: 'p1',
  repository: 'OWOX/example-plugin',
  scope: 'member',
  isActive: true,
  allProjects: false,
  audienceProjectIds: [],
  currentSemver: '0.1.0',
  ...(diagnostics ? { diagnostics } : {}),
  ...overrides,
});

const diagnostics = (
  rejections: NonNullable<PluginPublication['diagnostics']>['rejections']
): NonNullable<PluginPublication['diagnostics']> => ({
  deliveryUrl: 'https://plugin.example.com',
  commitSha: 'abc',
  accessMode: 'app',
  syncedAt: '2026-08-17T13:00:12.933Z',
  acceptedSemvers: [],
  unchangedSemvers: [],
  rejections,
});

const incompatible = {
  tagName: 'v0.1.2',
  githubReleaseId: 'r2',
  code: 'COLLECTIONS_INCOMPATIBLE',
  detail: 'Collection "dashboards" cannot change entity binding',
};

describe('findReleaseIssues', () => {
  // The reported case: the plugin sits on an old version and, without this, nothing
  // anywhere says why.
  it('surfaces a publisher-fixable rejection with the check time', () => {
    const issues = findReleaseIssues([publication(diagnostics([incompatible]))]);

    expect(issues?.rejections).toEqual([incompatible]);
    expect(issues?.syncedAt).toBe('2026-08-17T13:00:12.933Z');
  });

  // Drafts and prerelease markers keep a release out deliberately; a repository full
  // of them would repeat forever and bury the entry that matters.
  it('hides rejections that are permanent by design', () => {
    const byDesign = diagnostics([
      { tagName: 'v0.2.0-rc.1', githubReleaseId: 'r3', code: 'PRERELEASE_TAG', detail: '…' },
      { tagName: 'v0.3.0', githubReleaseId: 'r4', code: 'DRAFT', detail: '…' },
    ]);

    expect(findReleaseIssues([publication(byDesign)])).toBeNull();
  });

  // An unknown code from a newer backend is shown rather than hidden: hiding it would
  // recreate the silence this card exists to end.
  it('shows a rejection code it does not recognize', () => {
    const unknown = { tagName: 'v0.4.0', githubReleaseId: 'r5', code: 'NEW_CODE', detail: '…' };

    expect(findReleaseIssues([publication(diagnostics([unknown]))])?.rejections).toEqual([unknown]);
  });

  it('returns null for a non-publisher, whose publications carry no diagnostics', () => {
    expect(findReleaseIssues([publication()])).toBeNull();
    expect(findReleaseIssues([])).toBeNull();
  });

  it('reads the first publication that carries diagnostics', () => {
    const issues = findReleaseIssues([
      publication(undefined, { publicationId: 'pub-0', scope: 'project' }),
      publication(diagnostics([incompatible])),
    ]);

    expect(issues?.rejections).toEqual([incompatible]);
  });
});
