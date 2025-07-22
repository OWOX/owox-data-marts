export interface BetterAuthConfig {
  database: any;
  emailAndPassword?: {
    enabled: boolean;
    requireEmailVerification?: boolean;
    sendEmailVerification?: (email: string, url: string, token: string) => Promise<void>;
  };
  magicLink?: {
    enabled: boolean;
    sendMagicLink?: (data: { email: string; url: string; token: string }) => Promise<void>;
  };
  socialProviders?: {
    google?: {
      clientId: string;
      clientSecret: string;
    };
    github?: {
      clientId: string;
      clientSecret: string;
    };
  };
  session?: {
    maxAge?: number;
  };
  trustedOrigins?: string[];
  baseURL?: string;
  secret: string;
}
