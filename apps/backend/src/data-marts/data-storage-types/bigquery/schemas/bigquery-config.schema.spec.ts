import { BigQueryConfigSchema } from './bigquery-config.schema';

// apps/web/src/features/data-storage/shared/types/data-storage.schema.test.ts repeats these
// cases against the web form's copy of the rule. Change both together.

describe('BigQueryConfigSchema.projectId', () => {
  describe('valid project IDs', () => {
    it.each([
      'my-project',
      'my-project-123',
      'abcdef',
      'a-cool-proj-30chars-still-fits',
      'a'.repeat(30),
      'example.com:my-project',
      'domain.co:abcdef',
    ])('accepts %s', projectId => {
      const result = BigQueryConfigSchema.safeParse({ projectId });
      expect(result.success).toBe(true);
    });
  });

  describe('invalid project IDs', () => {
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
      const result = BigQueryConfigSchema.safeParse({ projectId });
      expect(result.success).toBe(false);
    });
  });
});
