import { jest } from '@jest/globals';
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

  it('words a clean result without a candidate version', () => {
    expect(
      checkSummary(
        result({ candidateVersion: null, baselineVersion: null, collectionsEvaluated: false })
      )
    ).toBe(
      'No issues found in abcdef1.\nCollection compatibility was not checked: the plugin has no current version and no --version was given.'
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
    expect(checkSummary(result({ collectionsEvaluated: false, baselineVersion: null }))).toBe(
      'A release of version 1.5.0 from abcdef1 would pass the checks.\nCollection compatibility was not checked: no version is recorded in that compatibility line.'
    );
  });

  it('prints no not-checked line when an invalid manifest skipped the comparison', () => {
    expect(
      checkSummary(
        result({
          issues: [{ code: 'MANIFEST_SCHEMA', detail: 'bad manifest' }],
          baselineVersion: '1.4.2',
          collectionsEvaluated: false,
        })
      )
    ).toBe('MANIFEST_SCHEMA: bad manifest');
  });

  it('propagates a request failure', async () => {
    const client = clientWith(async () => {
      throw new Error('boom');
    });

    await expect(checkPlugin(client, 'OWOX/example', 'main')).rejects.toThrow('boom');
  });
});

describe('plugins check run', () => {
  const run = async (
    check: (input: unknown) => Promise<OWOXPluginCheckResult>,
    argv = ['OWOX/example', '--ref', 'main']
  ) => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    class Harness extends PluginsCheck {
      protected override loadEnvironment() {
        return null;
      }
      protected override getAuthenticatedClient() {
        return clientWith(check);
      }
      override log(message?: string) {
        stdout.push(message ?? '');
      }
    }
    const spy = jest.spyOn(process.stderr, 'write').mockImplementation(chunk => {
      stderr.push(String(chunk));
      return true;
    });
    let exitCode = 0;
    try {
      await new Harness(argv, {
        runHook: async () => ({ successes: [], failures: [] }),
      } as never).run();
    } catch (error) {
      exitCode = (error as { oclif?: { exit?: number } }).oclif?.exit ?? -1;
    } finally {
      spy.mockRestore();
    }
    return { stdout, stderr, exitCode };
  };

  it('exits 0 for a clean result, with JSON on stdout and the summary on stderr', async () => {
    const { stdout, stderr, exitCode } = await run(async () => result());

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout.join('\n'))).toEqual(result());
    expect(stderr.join('')).toContain('would pass the checks');
  });

  it('exits 1 when there are issues', async () => {
    const withIssue = result({ issues: [{ code: 'COLLECTIONS_INCOMPATIBLE', detail: 'broken' }] });
    const { stdout, stderr, exitCode } = await run(async () => withIssue);

    expect(exitCode).toBe(1);
    expect(JSON.parse(stdout.join('\n'))).toEqual(withIssue);
    expect(stderr.join('')).toContain('COLLECTIONS_INCOMPATIBLE: broken');
  });

  it('sends --version through run(), including an empty one', async () => {
    const inputs: unknown[] = [];
    const check = async (input: unknown) => {
      inputs.push(input);
      return result();
    };

    await run(check, ['OWOX/example', '--ref', 'main', '--version', '1.5.0']);
    await run(check, ['OWOX/example', '--ref', 'main', '--version', '']);

    expect(inputs).toEqual([
      { repository: 'OWOX/example', ref: 'main', version: '1.5.0' },
      { repository: 'OWOX/example', ref: 'main', version: '' },
    ]);
  });

  it('treats a missing --ref as a parse error without calling the API', async () => {
    const check = jest.fn(async (_input: unknown) => result());
    const { stdout, stderr, exitCode } = await run(check, ['OWOX/example']);

    expect(check).not.toHaveBeenCalled();
    expect(exitCode).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr.join('')).toContain('ref');
  });

  it('prints the installation hint when the error carries an installation URL', async () => {
    const { stderr, exitCode } = await run(async () => {
      throw Object.assign(new Error('OWOX cannot read OWOX/example'), {
        code: 'GITHUB_REPO_NOT_ACCESSIBLE',
        details: { installationUrl: 'https://github.com/apps/owox/installations/new' },
      });
    });

    expect(exitCode).toBe(1);
    expect(stderr.join('')).toContain(
      'Install the OWOX Data Marts GitHub App at https://github.com/apps/owox/installations/new'
    );
  });

  it('reports an unresolved commit as an issue and exits 1', async () => {
    const unresolved = result({
      commitSha: null,
      candidateVersion: null,
      baselineVersion: null,
      collectionsEvaluated: false,
      issues: [{ code: 'COMMIT_UNRESOLVABLE', detail: 'Ref nope does not resolve' }],
    });
    const { stdout, stderr, exitCode } = await run(async () => unresolved);

    expect(exitCode).toBe(1);
    expect(JSON.parse(stdout.join('\n'))).toEqual(unresolved);
    expect(stderr.join('')).toBe('COMMIT_UNRESOLVABLE: Ref nope does not resolve\n');
  });

  it('reports a request failure as error JSON and exits 1', async () => {
    const { stdout, stderr, exitCode } = await run(async () => {
      throw new Error('boom');
    });

    expect(exitCode).toBe(1);
    expect(stdout).toEqual([]);
    expect(JSON.parse(stderr.join(''))).toMatchObject({ error: { message: 'boom' } });
  });
});
