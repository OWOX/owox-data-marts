import type { OWOXPluginCheckResult } from '@owox/api-client';

import PluginsCheck, { checkPlugin, checkSummary } from './check.js';

const result = (patch: Partial<OWOXPluginCheckResult> = {}): OWOXPluginCheckResult => ({
  pluginId: 'p1',
  repository: 'OWOX/example',
  commitSha: 'abcdef1234567',
  candidateVersion: '1.5.0',
  baselineVersion: '1.4.0',
  collectionsEvaluated: true,
  issues: [],
  ...patch,
});

const clientWith = (check: (input: unknown) => Promise<OWOXPluginCheckResult>) =>
  ({ plugins: { check } }) as never;

describe('plugins check', () => {
  it('requires --ref and takes only a repository argument', () => {
    expect(PluginsCheck.flags.ref.required).toBe(true);
    expect(Object.keys(PluginsCheck.args)).toEqual(['repository']);
  });

  it('passes the ref and omits an absent version', async () => {
    const calls: unknown[] = [];
    const client = clientWith(async input => {
      calls.push(input);
      return result();
    });

    await checkPlugin(client, 'OWOX/example', 'main');
    await checkPlugin(client, 'OWOX/example', 'main', '1.5.0');

    expect(calls).toEqual([
      { repository: 'OWOX/example', ref: 'main' },
      { repository: 'OWOX/example', ref: 'main', version: '1.5.0' },
    ]);
  });

  it('says a passing release would pass', () => {
    expect(checkSummary(result())).toBe(
      'A release of version 1.5.0 from abcdef1 would pass the checks.'
    );
  });

  it('lists each issue as code: detail', () => {
    const summary = checkSummary(
      result({
        issues: [
          { code: 'VERSION_CONFLICT', detail: 'Version 1.5.0 is already recorded from commit x' },
          { code: 'COLLECTIONS_INCOMPATIBLE', detail: 'broken' },
        ],
      })
    );

    expect(summary).toBe(
      'VERSION_CONFLICT: Version 1.5.0 is already recorded from commit x\nCOLLECTIONS_INCOMPATIBLE: broken'
    );
  });

  it('explains why collections were not evaluated', () => {
    expect(checkSummary(result({ collectionsEvaluated: false, baselineVersion: null }))).toContain(
      'no version is recorded in that compatibility line'
    );
    expect(checkSummary(result({ collectionsEvaluated: false, candidateVersion: null }))).toContain(
      'no current version'
    );
  });

  it('propagates a request failure', async () => {
    const client = clientWith(async () => {
      throw new Error('boom');
    });

    await expect(checkPlugin(client, 'OWOX/example', 'main')).rejects.toThrow('boom');
  });
});
