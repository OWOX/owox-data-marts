import { z } from 'zod';

/** User information and state for auth flow completion. */
export interface AuthFlowRequest {
  state: string;
  userInfo: {
    uid: string;
    signinProvider: string;
    email: string;
    firstName?: string;
    lastName?: string;
    fullName?: string;
    avatar?: string;
  };
}

/** One-time authorization code response. */
export interface AuthFlowResponse {
  code: string;
}

/** Validates auth flow response structure. */
export const AuthFlowResponseSchema = z.object({
  code: z.string().min(1, 'Authorization code is required'),
});
