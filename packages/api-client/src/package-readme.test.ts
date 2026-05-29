import { existsSync, readFileSync } from 'node:fs';

describe('package README', () => {
  const readmeUrl = new URL('../README.md', import.meta.url);

  it('provides npm users with install and package-safe documentation links', () => {
    if (!existsSync(readmeUrl)) {
      throw new Error('packages/api-client/README.md must exist for npm package publishing');
    }

    const readme = readFileSync(readmeUrl, 'utf8');

    expect(readme).toContain('# @owox/api-client');
    expect(readme).toContain('npm install @owox/api-client');
    expect(readme).toContain('https://docs.owox.com/docs/api/api-client/');
    expect(readme).toContain('https://docs.owox.com/docs/api/api-keys/');
    expect(readme).toContain('https://docs.owox.com/docs/api/openapi/');
    expect(readme).not.toContain('github.com/OWOX/owox-data-marts/blob/main/docs');
    expect(readme).not.toContain('new OWOXApiClient');
    expect(readme).not.toContain('## Basic usage');
    expect(readme).not.toContain('## Error handling');
    expect(readme).not.toContain('./api-keys/');
    expect(readme).not.toContain('./owox-ctl/');
    expect(readme).not.toContain('./openapi/');
  });
});
