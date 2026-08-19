import { describe, expect, it } from '@jest/globals';
import { MicrosoftProvider } from './microsoft-provider.js';

const provider = new MicrosoftProvider({ clientId: 'client', clientSecret: 'secret' });

describe('MicrosoftProvider profile mapping', () => {
  it('keeps ordinary Microsoft browser sign-in independent from extension claims', () => {
    expect(
      provider.mapProfile({
        oid: 'oid-1',
        tid: 'tid-1',
        email: 'user@example.com',
      })
    ).toMatchObject({
      accountId: 'oid-1:tid-1',
      email: 'user@example.com',
      emailVerified: true,
    });
  });

  it('preserves the existing preferred_username fallback for browser sign-in', () => {
    expect(
      provider.mapProfile({
        oid: 'oid-1',
        tid: 'tid-1',
        preferred_username: 'user@example.com',
      })
    ).toMatchObject({
      accountId: 'oid-1:tid-1',
      email: 'user@example.com',
      emailVerified: true,
    });
  });
});
