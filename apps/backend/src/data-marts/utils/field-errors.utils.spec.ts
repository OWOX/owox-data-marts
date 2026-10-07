import { z } from 'zod';
import { describeInvalidInput, toFieldErrors } from './field-errors.utils';
import { BigQueryConfigSchema } from '../data-storage-types/bigquery/schemas/bigquery-config.schema';
import { ValidationResult } from '../data-storage-types/interfaces/data-storage-access-validator.interface';

describe('field-errors.utils', () => {
  const credentialsSchema = z.object({
    username: z.string().min(1, 'username is required'),
    password: z.string().min(1, 'password is required'),
  });

  it('prefixes each issue path with the request scope', () => {
    const parsed = BigQueryConfigSchema.safeParse({ projectId: 'BASE DE LEADS' });
    if (parsed.success) throw new Error('expected the project ID to be rejected');

    expect(toFieldErrors('config', parsed.error)).toEqual([
      { field: 'config.projectId', message: expect.stringContaining('Invalid GCP project ID') },
    ]);
  });

  it('reports every rejected credential value, not only the first', () => {
    const parsed = credentialsSchema.safeParse({ username: '', password: '' });
    if (parsed.success) throw new Error('expected credentials to be rejected');

    expect(toFieldErrors('credentials', parsed.error).map(e => e.field)).toEqual([
      'credentials.username',
      'credentials.password',
    ]);
  });

  it('names a missing key instead of repeating a bare "Required"', () => {
    const parsed = credentialsSchema.safeParse({ password: 'secret' });
    if (parsed.success) throw new Error('expected credentials to be rejected');

    expect(toFieldErrors('credentials', parsed.error)).toEqual([
      { field: 'credentials.username', message: 'username is required' },
    ]);
  });

  it('names the rejected values in the message', () => {
    const parsed = credentialsSchema.safeParse({ username: '', password: '' });
    if (parsed.success) throw new Error('expected credentials to be rejected');

    expect(describeInvalidInput('credentials', parsed.error)).toBe(
      'Invalid credentials — username is required; password is required'
    );
  });

  it('says the same thing in the message as on the field for a missing key', () => {
    const parsed = credentialsSchema.safeParse({ password: 'secret' });
    if (parsed.success) throw new Error('expected credentials to be rejected');

    expect(describeInvalidInput('credentials', parsed.error)).toBe(
      'Invalid credentials — username is required'
    );
  });

  it('never quotes a submitted value that an enum rejected', () => {
    const schema = z.object({ authMethod: z.enum(['PASSWORD', 'KEY_PAIR']) });
    const parsed = schema.safeParse({ authMethod: 's3cr3t-value' });
    if (parsed.success) throw new Error('expected the value to be rejected');

    const [fieldError] = toFieldErrors('credentials', parsed.error);
    expect(fieldError).toEqual({
      field: 'credentials.authMethod',
      message: "authMethod must be one of 'PASSWORD' | 'KEY_PAIR'",
    });
    expect(describeInvalidInput('credentials', parsed.error)).not.toContain('s3cr3t-value');
  });

  it('falls back to the scope when the whole object is missing', () => {
    const parsed = credentialsSchema.safeParse(undefined);
    if (parsed.success) throw new Error('expected credentials to be rejected');

    expect(toFieldErrors('credentials', parsed.error)).toEqual([
      { field: 'credentials', message: 'Required' },
    ]);
    expect(describeInvalidInput('credentials', parsed.error)).toBe(
      'Invalid credentials — credentials: Required'
    );
  });

  it.each([
    ['an enum', z.object({ authMethod: z.enum(['PASSWORD', 'KEY_PAIR']) })],
    ['a literal', z.object({ type: z.literal('service_account') })],
    [
      'a union',
      z.union([z.object({ authMethod: z.literal('PASSWORD') }), z.object({ token: z.string() })]),
    ],
  ])('keeps a value %s rejected out of the whole response', (_case, schema) => {
    const submitted = { authMethod: 's3cr3t-value', type: 's3cr3t-value' };
    const parsed = schema.safeParse(submitted);
    if (parsed.success) throw new Error('expected the value to be rejected');

    const result = ValidationResult.invalidInput('credentials', parsed.error);

    expect(JSON.stringify(result.reason)).not.toContain('s3cr3t-value');
    expect(result.errorMessage).not.toContain('s3cr3t-value');
  });

  it('ValidationResult.invalidInput keeps the raw issues next to the field errors', () => {
    const parsed = BigQueryConfigSchema.safeParse({ projectId: 'GTM-NC2077' });
    if (parsed.success) throw new Error('expected the project ID to be rejected');

    const result = ValidationResult.invalidInput('config', parsed.error);

    expect(result.valid).toBe(false);
    expect(result.errorMessage).toMatch(/^Invalid config — projectId: /);
    expect(result.reason).toEqual({
      errors: parsed.error.errors,
      fieldErrors: [{ field: 'config.projectId', message: expect.any(String) }],
    });
  });
});
