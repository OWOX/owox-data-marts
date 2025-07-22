/**
 * IDP Provider capabilities - defines what features/endpoints are supported
 */
export interface IdpCapabilities {
  // Authentication Pages
  authPages: {
    signIn?: boolean;
    signOut?: boolean;
    signUp?: boolean;
    magicLink?: boolean;
    socialAuth?: {
      google?: boolean;
      microsoft?: boolean;
    };
    emailVerification?: boolean;
    passwordReset?: boolean;
  };

  // Authentication API
  authApi: {
    tokenRefresh?: boolean;
    tokenRevoke?: boolean;
    tokenIntrospection?: boolean;
  };

  // Management API
  managementApi: {
    users?: {
      list?: boolean;
      create?: boolean;
      read?: boolean;
      update?: boolean;
      delete?: boolean;
    };
    projects?: {
      list?: boolean;
      create?: boolean;
      read?: boolean;
      update?: boolean;
      delete?: boolean;
    };
    roles?: {
      list?: boolean;
      create?: boolean;
      assign?: boolean;
    };
    sessions?: {
      list?: boolean;
      revoke?: boolean;
    };
    health?: boolean;
  };
}

/**
 * Default capabilities for a minimal IDP implementation
 */
export const DEFAULT_CAPABILITIES: IdpCapabilities = {
  authPages: {
    signIn: true,
    signOut: true,
    signUp: false,
    magicLink: false,
    socialAuth: {},
    emailVerification: false,
    passwordReset: false,
  },
  authApi: {
    tokenRefresh: true,
    tokenRevoke: false,
    tokenIntrospection: true,
  },
  managementApi: {
    users: {
      read: true,
      update: false,
      list: false,
      create: false,
      delete: false,
    },
    projects: {},
    roles: {},
    sessions: {},
    health: true,
  },
};
