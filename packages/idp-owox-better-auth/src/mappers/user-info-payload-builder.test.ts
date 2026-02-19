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

    expect(payload.userInfo.firstName).toBe('User');
    expect(payload.userInfo.lastName).toBeUndefined();
    expect(payload.userInfo.fullName).toBe('User');
    expect(payload.userInfo.avatar).toBeUndefined();
  });

  it('generates name from email when missing', () => {
    const payload = buildUserInfoPayload({
      state: 'state-3',
      user: { ...baseUser, name: undefined, email: 'john.doe@test.com' },
      account: baseAccount,
    });

    expect(payload.userInfo.fullName).toBe('John Doe');
    expect(payload.userInfo.firstName).toBe('John');
    expect(payload.userInfo.lastName).toBe('Doe');
  });

  it('handles plus addressing when generating name', () => {
    const payload = buildUserInfoPayload({
      state: 'state-4',
      user: { ...baseUser, name: '', email: 'alice+work@test.com' },
      account: baseAccount,
    });

    expect(payload.userInfo.fullName).toBe('Alice');
    expect(payload.userInfo.firstName).toBe('Alice');
    expect(payload.userInfo.lastName).toBeUndefined();
  });
});
