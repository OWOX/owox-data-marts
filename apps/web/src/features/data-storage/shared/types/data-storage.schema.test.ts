import { describe, expect, it } from 'vitest';
import { googleBigQuerySchema } from './data-storage.schema';

// The same accept/reject table as the backend's
// apps/backend/src/data-marts/data-storage-types/bigquery/schemas/bigquery-config.schema.spec.ts:
// a client rule stricter than the server's would block valid IDs with no fallback.
const parseProjectId = (projectId: string) =>
  googleBigQuerySchema.shape.config.safeParse({ projectId, location: 'US' });

describe('googleBigQuerySchema config.projectId', () => {
  it.each([
    'my-project',
    'my-project-123',
    'abcdef',
    'a-cool-proj-30chars-still-fits',
    'a'.repeat(30),
    'example.com:my-project',
    'domain.co:abcdef',
  ])('accepts %s', projectId => {
    expect(parseProjectId(projectId).success).toBe(true);
  });

  it.each([
    ['uppercase letters', 'GTM-NC2077'],
    ['starts with a digit', '1my-project'],
    ['too short', 'abc'],
    ['one under the minimum length', 'abcde'],
    ['one over the maximum length', 'a'.repeat(31)],
    ['a project name with spaces', 'BASE DE LEADS SAFETY'],
    ['ends with a hyphen', 'my-project-'],
    ['underscore not allowed', 'my_project'],
    ['empty string', ''],
  ])('rejects %s (%s)', (_label, projectId) => {
    expect(parseProjectId(projectId).success).toBe(false);
  });

  it('sends a pasted ID without the whitespace around it', () => {
    const result = parseProjectId('  my-project-123\n');
    expect(result.success && result.data.projectId).toBe('my-project-123');
  });
});
