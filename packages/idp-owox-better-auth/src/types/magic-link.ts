import type { MagicLinkIntentValue } from '../core/constants.js';

export type MagicLinkIntent = MagicLinkIntentValue | undefined;

export interface MagicLinkEmailPayload {
  email: string;
  magicLink: string;
  intent?: MagicLinkIntent;
}
