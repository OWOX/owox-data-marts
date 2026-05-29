import { existsSync, readFileSync } from 'node:fs';

describe('package README', () => {
  const readmeUrl = new URL('../README.md', import.meta.url);

  it('provides npm users with install, usage, and package-safe documentation links', () => {
    if (!existsSync(readmeUrl)) {
      throw new Error('packages/api-client/README.md must exist for npm package publishing');
    }

    const readme = readFileSync(readmeUrl, 'utf8');

    expect(readme).toContain('# @owox/api-client');
    expect(readme).toContain('npm install @owox/api-client');
    expect(readme).toContain('new OWOXApiClient');
    expect(readme).toContain(
      'https://github.com/OWOX/owox-data-marts/blob/main/docs/api/api-client.md'
    );
    expect(readme).toContain(
      'https://github.com/OWOX/owox-data-marts/blob/main/docs/api/api-keys.md'
    );
    expect(readme).not.toContain('./api-keys/');
    expect(readme).not.toContain('./owox-ctl/');
    expect(readme).not.toContain('./openapi/');
  });
});
