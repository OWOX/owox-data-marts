import { z } from 'zod';
import { savePersonalDataResponse } from './account-data-export';

const emailLinkSchema = z.object({
  email: z.email().max(320),
  signature: z.string().min(1).max(512),
});
const subscriptionLinkSchema = emailLinkSchema.extend({
  topicId: z.string().min(1).max(128),
  expiresAt: z.string().max(128).optional(),
});
const signedPreferencesSchema = z.object({
  topics: z.array(
    z.object({ id: z.string(), subscribed: z.boolean(), signature: z.string().min(1) })
  ),
  allSignature: z.string().min(1),
});

export type EmailLink = z.infer<typeof emailLinkSchema>;
export type SubscriptionLink = z.infer<typeof subscriptionLinkSchema>;
export type SignedEmailPreferences = z.infer<typeof signedPreferencesSchema>;

export function parseAccountLink(params: URLSearchParams, action: 'subscriptions' | 'export') {
  // Decode once using URLSearchParams; the original expiry string is part of the signature.
  const link = {
    email: params.get('email'),
    signature: params.get('hash'),
    topicId: params.get('topicName') ?? 'all',
    expiresAt: params.get('expires_date') ?? undefined,
  };
  return action === 'subscriptions'
    ? subscriptionLinkSchema.safeParse(link)
    : emailLinkSchema.safeParse(link);
}

async function signedAccountRequest(origin: string, path: string, method: string, body: unknown) {
  return fetch(new URL(path, origin), {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'error',
    referrerPolicy: 'no-referrer',
  });
}

export async function updateEmailPreferenceByLink(
  origin: string,
  link: SubscriptionLink,
  subscribed: boolean
): Promise<SignedEmailPreferences> {
  const response = await signedAccountRequest(
    origin,
    '/api/account/email-preferences/link',
    'PATCH',
    {
      ...link,
      subscribed,
    }
  );
  if (!response.ok) throw new Error('Could not update your email preferences.');
  return signedPreferencesSchema.parse(await response.json());
}

export async function downloadPersonalDataByLink(origin: string, link: EmailLink): Promise<void> {
  await savePersonalDataResponse(
    await signedAccountRequest(origin, '/api/account/personal-data/export', 'POST', link)
  );
}
