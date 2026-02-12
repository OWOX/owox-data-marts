import { describe, expect, it } from '@jest/globals';
import { buildUserInfoPayload } from './user-info-payload-builder.js';

const baseUser = {
  id: 'u1',
  email: 'user@test.com',
} as const;

const baseAccount = {
  id: 'acc-db',
  userId: 'u1',
  providerId: 'google',
  accountId: 'google-123',
} as const;

describe('buildUserInfoPayload', () => {
  it('maps full name parts and avatar when present', () => {
    const payload = buildUserInfoPayload({
      state: 'state-1',
      user: { ...baseUser, name: 'Jane Doe Smith', image: 'https://img.test/avatar.png' },
      account: baseAccount,
    });

    expect(payload.userInfo).toMatchObject({
      uid: 'google-123',
      signinProvider: 'google',
      email: 'user@test.com',
      firstName: 'Jane',
      lastName: 'Doe Smith',
      fullName: 'Jane Doe Smith',
      avatar: 'https://img.test/avatar.png',
    });
  });

  it('leaves optional fields undefined when absent', () => {
    const payload = buildUserInfoPayload({
      state: 'state-2',
      user: { ...baseUser, name: undefined, image: null },
      account: baseAccount,
    });

    expect(payload.userInfo.firstName).toBeUndefined();
    expect(payload.userInfo.lastName).toBeUndefined();
    expect(payload.userInfo.fullName).toBeUndefined();
    expect(payload.userInfo.avatar).toBeUndefined();
  });
});
