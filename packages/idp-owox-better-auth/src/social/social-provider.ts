import { LogLevel } from '@owox/internal-helpers';

export type Profile = Record<string, unknown>;

export type SocialUser = {
  accountId: string;
  email: string | null;
  name: string | null;
  image: string | null;
  emailVerified: boolean;
};

export type ProviderLogger = {
  log: (level: LogLevel, message: string, meta?: Record<string, unknown>) => void;
};

export interface SocialProvider {
  providerId: string;
  mapProfile(profile: Profile): SocialUser;
}
