import { z } from 'zod';
import { isSafePath } from '../../features/idp/services/redirect-storage.service';
import { isOnboardingStepPath } from '../../features/idp/utils/post-auth-redirect';

const emailSchema = z.string().email().max(320);

/** Upper bound for one batch, so a pasted mailing list can't fan out into hundreds of invites. */
export const MAX_INVITE_EMAILS = 20;

export function isValidEmail(value: string): boolean {
  return emailSchema.safeParse(value).success;
}

/**
 * Splits typed or pasted text into trimmed, lower-cased email candidates. Commas, semicolons
 * and whitespace all separate entries, so a list copied from a mail client works as is.
 */
export function splitEmailInput(value: string): string[] {
  return value
    .split(/[\s,;]+/)
    .map(part => part.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * The page the invite step continues to: the app root or a safe in-app path, and never an
 * onboarding step itself, so a crafted link can neither leave the app nor loop back here.
 */
export function resolveContinueTarget(raw: string | null): string {
  if (!isSafePath(raw)) return '/';
  const target = raw.trim();
  const pathname = target.split(/[?#]/, 1)[0];
  return isOnboardingStepPath(pathname) ? '/' : target;
}
