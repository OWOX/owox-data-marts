import { describe, expect, it } from 'vitest';
import { googleCredentialsWithOAuthSchema } from './google-credentials.schema';

describe('googleCredentialsWithOAuthSchema', () => {
  it('passes when a service account is provided', () => {
    const result = googleCredentialsWithOAuthSchema.safeParse({
      serviceAccount: '{"client_email":"sa@project.iam.gserviceaccount.com"}',
    });
    expect(result.success).toBe(true);
  });

  it('passes when a credentialId is provided', () => {
    const result = googleCredentialsWithOAuthSchema.safeParse({
      serviceAccount: '',
      credentialId: '6f1b9c0a-2f64-4f4e-9f3a-1f2e3d4c5b6a',
    });
    expect(result.success).toBe(true);
  });

  it('reports the missing-auth error on both serviceAccount and credentialId paths', () => {
    const result = googleCredentialsWithOAuthSchema.safeParse({
      serviceAccount: '',
      credentialId: null,
    });
    expect(result.success).toBe(false);
    if (result.success) return;

    const paths = result.error.issues.map(issue => issue.path.join('.'));
    // Each auth method renders its own field, so the error must be addressed
    // to whichever field is currently mounted.
    expect(paths).toContain('serviceAccount');
    expect(paths).toContain('credentialId');
  });

  it.each([
    ['not JSON', '{"client_email": ', 'Service Account must be a valid JSON string'],
    ['a JSON array', '[]', 'Service Account must be a valid JSON object'],
    [
      'a key without client_email',
      '{"installed":{"client_id":"x"}}',
      'Service Account must contain a client_email field',
    ],
  ])('flags a service account that is %s on the serviceAccount field', (_case, value, message) => {
    const result = googleCredentialsWithOAuthSchema.safeParse({ serviceAccount: value });
    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.error.issues).toEqual([
      expect.objectContaining({ path: ['serviceAccount'], message }),
    ]);
  });

  it('flags a broken service account even when a saved credential exists', () => {
    // The user replaced a saved key with a broken one: the saved credential must not mask it.
    const result = googleCredentialsWithOAuthSchema.safeParse({
      serviceAccount: 'not json',
      credentialId: '6f1b9c0a-2f64-4f4e-9f3a-1f2e3d4c5b6a',
    });
    expect(result.success).toBe(false);
  });

  it('passes the saved key the form shows back, which has no private part', () => {
    const result = googleCredentialsWithOAuthSchema.safeParse({
      serviceAccount: JSON.stringify({
        type: 'service_account',
        project_id: 'my-project',
        client_id: '123',
        client_email: 'sa@my-project.iam.gserviceaccount.com',
      }),
      credentialId: '6f1b9c0a-2f64-4f4e-9f3a-1f2e3d4c5b6a',
    });
    expect(result.success).toBe(true);
  });
});
