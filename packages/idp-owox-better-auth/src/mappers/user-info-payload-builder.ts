import type { DatabaseAccount, DatabaseUser } from '../types/database-models.js';
import type { UserInfoPayload } from '../services/auth-flow-service.js';

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

  return {
    state: params.state,
    userInfo: {
      uid: params.account.accountId,
      signinProvider: params.account.providerId,
      email,
    },
  };
}
