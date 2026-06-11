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
});