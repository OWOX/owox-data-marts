import { BigQueryConfigSchema } from './bigquery-config.schema';

describe('BigQueryConfigSchema.projectId', () => {
  describe('valid project IDs', () => {
    it.each([
      'my-project',
      'my-project-123',
      'abcdef',
      'a-cool-proj-30chars-still-fits',
      'example.com:my-project',
      'domain.co:abcdef',
    ])('accepts %s', projectId => {
      const result = BigQueryConfigSchema.safeParse({ projectId });
      expect(result.success).toBe(true);
    });
  });

  describe('invalid project IDs', () => {
    it.each([
      ['uppercase letters', 'GTM-NC4KR2JL'],
      ['starts with a digit', '1my-project'],
      ['too short', 'abc'],
      ['ends with a hyphen', 'my-project-'],
      ['underscore not allowed', 'my_project'],
      ['empty string', ''],
    ])('rejects %s (%s)', (_label, projectId) => {
      const result = BigQueryConfigSchema.safeParse({ projectId });
      expect(result.success).toBe(false);
    });
  });
});
