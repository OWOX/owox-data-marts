import type { UserInfoPayload } from '../services/auth/platform-auth-flow-client.js';
import type { DatabaseAccount, DatabaseUser } from '../types/database-models.js';
import { resolveNameWithFallback, splitName } from '../utils/email-utils.js';

/**
 * Builds the auth-flow payload from DB user and account data.
 */
export function buildUserInfoPayload(params: {
  state: string;
  user: DatabaseUser;
  account: DatabaseAccount;
}): UserInfoPayload {
  const email = params.user.email;
  if (!email) {
    throw new Error('Email not found in DB');
  }

  const resolvedName = resolveNameWithFallback(params.user.name, email) ?? '';
  const { firstName, lastName, fullName } = splitName(resolvedName);
  const avatar = params.user.image ?? undefined;

  return {
    state: params.state,
    userInfo: {
      uid: params.account.accountId,
      signinProvider: params.account.providerId,
      email,
      firstName: toOptional(firstName),
      lastName: toOptional(lastName),
      fullName: toOptional(fullName),
      avatar,
    },
  };
}

function toOptional(value: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
