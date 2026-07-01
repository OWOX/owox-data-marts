import { readFileSync } from 'node:fs';

describe('package README', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

  it('links to the full CLI documentation with a stable package-safe URL', () => {
    expect(readme).toContain('https://docs.owox.com/docs/api/owox-ctl/');
    expect(readme).not.toContain('../../docs/api/owox-ctl.md');
    expect(readme).not.toContain('github.com/OWOX/owox-data-marts/blob/main/docs');
  });
});
