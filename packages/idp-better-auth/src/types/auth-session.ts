/**
 * Better Auth session data
 */
export interface AuthSession {
  user: {
    id: string;
    email: string;
    name?: string;
  };
  session: {
    id: string;
    userId: string;
    token: string;
    expiresAt: Date;
  };
}

/**
 * Session validation result
 */
export interface SessionValidationResult {
  isValid: boolean;
  session?: AuthSession;
  error?: string;
}
