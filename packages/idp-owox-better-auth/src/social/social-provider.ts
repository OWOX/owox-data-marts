/**
 * Shared types and contracts for social auth providers.
 */
export type Profile = Record<string, unknown>;

export type SocialUser = {
  accountId: string;
  email: string | null;
  name: string | null;
  image: string | null;
  emailVerified: boolean;
};

/**
 * Defines how a social provider maps a profile to a user object.
 */
export interface SocialProvider {
  providerId: string;
  mapProfile(profile: Profile): SocialUser;
}
