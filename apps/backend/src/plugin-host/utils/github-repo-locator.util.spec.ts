import { InvalidRepoLocatorError } from '../errors/plugin-host.errors';
import { parseGithubRepoLocator } from './github-repo-locator.util';

describe('parseGithubRepoLocator', () => {
  it.each([
    'OWOX/example-plugin',
    'https://github.com/OWOX/example-plugin',
    'https://github.com/OWOX/example-plugin/',
    'https://github.com/OWOX/example-plugin.git',
    'https://github.com/OWOX/example-plugin/tree/main',
    'https://www.github.com/OWOX/example-plugin',
    'http://github.com/OWOX/example-plugin',
    'git@github.com:OWOX/example-plugin.git',
    '  OWOX/example-plugin  ',
  ])('parses %s', locator => {
    expect(parseGithubRepoLocator(locator)).toEqual({ owner: 'OWOX', name: 'example-plugin' });
  });

  it('preserves the casing the publisher typed', () => {
    // Identity comes from GitHub's numeric repo id, so casing here is display metadata
    // only -- but silently lowercasing it would show publishers a name they never wrote.
    expect(parseGithubRepoLocator('OWOX/Example-Plugin')).toEqual({
      owner: 'OWOX',
      name: 'Example-Plugin',
    });
  });

  it.each([
    'https://gitlab.com/OWOX/example-plugin',
    'https://example.com/OWOX/example-plugin',
    'git@gitlab.com:OWOX/example-plugin.git',
    'OWOX',
    'OWOX/a/b/c',
    'OWOX/',
    '/example-plugin',
    '',
    '   ',
    'not a url',
  ])('rejects %s', locator => {
    expect(() => parseGithubRepoLocator(locator)).toThrow(InvalidRepoLocatorError);
  });

  it('reports the offending locator without leaking anything else', () => {
    try {
      parseGithubRepoLocator('https://gitlab.com/a/b');
      fail('expected a throw');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'INVALID_REPO_LOCATOR',
        errorDetails: { locator: 'https://gitlab.com/a/b' },
      });
    }
  });
});
