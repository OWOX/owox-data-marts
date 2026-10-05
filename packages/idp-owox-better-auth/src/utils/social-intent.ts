import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { clearCookie, setCookie } from './cookie-policy.js';
import { getCookie } from './request-utils.js';

const SOCIAL_INTENT_COOKIE = 'idp-owox-social-intent';
const VERIFIED_SOCIAL_INTENT_COOKIE = 'idp-owox-verified-social-intent';
const SOCIAL_INTENT_TTL_MS = 2 * 60 * 1000;
export type SocialProvider = 'google' | 'microsoft';

type NonceRecord = { value: string; issuedAt: number };

function readNonces(req: Request): NonceRecord[] {
  const raw = getCookie(req, SOCIAL_INTENT_COOKIE);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(raw));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is NonceRecord =>
        typeof item?.value === 'string' &&
        typeof item?.issuedAt === 'number' &&
        Date.now() - item.issuedAt < SOCIAL_INTENT_TTL_MS
    );
  } catch {
    return [];
  }
}

/** A page token proves the social action came from a rendered auth page. */
export function issueSocialIntentNonce(req: Request, res: Response): string {
  const nonce = randomBytes(24).toString('base64url');
  const nonces = [...readNonces(req).slice(-7), { value: nonce, issuedAt: Date.now() }];
  setCookie(res, req, SOCIAL_INTENT_COOKIE, encodeURIComponent(JSON.stringify(nonces)), {
    maxAgeMs: SOCIAL_INTENT_TTL_MS,
  });
  return nonce;
}

/** Consume once; a cross-site link or form cannot supply the page token. */
export function consumeSocialIntentNonce(req: Request, res: Response, nonce: unknown): boolean {
  if (typeof nonce !== 'string' || !nonce) return false;
  const nonces = readNonces(req);
  const matched = nonces.some(item => item.value === nonce);
  if (!matched) return false;
  const remaining = nonces.filter(item => item.value !== nonce);
  if (remaining.length) {
    setCookie(res, req, SOCIAL_INTENT_COOKIE, encodeURIComponent(JSON.stringify(remaining)), {
      maxAgeMs: SOCIAL_INTENT_TTL_MS,
    });
  } else {
    clearCookie(res, SOCIAL_INTENT_COOKIE, req);
  }
  return true;
}

/** Only the verified button POST can persist an action for the Platform round trip. */
export function persistVerifiedSocialIntent(
  req: Request,
  res: Response,
  provider: SocialProvider
): void {
  setCookie(res, req, VERIFIED_SOCIAL_INTENT_COOKIE, provider, {
    maxAgeMs: SOCIAL_INTENT_TTL_MS,
  });
}

export function readVerifiedSocialIntent(req: Request): SocialProvider | undefined {
  const provider = getCookie(req, VERIFIED_SOCIAL_INTENT_COOKIE);
  return provider === 'google' || provider === 'microsoft' ? provider : undefined;
}

export function clearVerifiedSocialIntent(req: Request, res: Response): void {
  clearCookie(res, VERIFIED_SOCIAL_INTENT_COOKIE, req);
}

/** A rendered page consumes the action, whether or not it has a usable state. */
export function consumeVerifiedSocialIntent(
  req: Request,
  res: Response
): SocialProvider | undefined {
  const raw = getCookie(req, VERIFIED_SOCIAL_INTENT_COOKIE);
  if (!raw) return undefined;
  clearVerifiedSocialIntent(req, res);
  return readVerifiedSocialIntent(req);
}
