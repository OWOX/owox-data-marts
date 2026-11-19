import { z } from 'zod';

const accountProfileSchema = z.object({
  fullName: z.string(),
  email: z.string(),
  workEmail: z.string(),
  phone: z.string(),
  companyName: z.string(),
  companyWebsite: z.string(),
  erasureRequest: z
    .object({ id: z.string().min(1), status: z.enum(['pending', 'confirmed']) })
    .nullable()
    .default(null),
});

export type AccountProfile = z.infer<typeof accountProfileSchema>;
export type AccountProfileFields = Partial<{
  fullName: string;
  workEmail: string;
  phone: string;
  companyName: string;
  companyWebsite: string;
}>;

const emailPreferencesPath = '/api/account/me/email-preferences';
const emailTopicSchema = z.object({ id: z.string().min(1), subscribed: z.boolean() });
const emailPreferencesSchema = z.object({ topics: z.array(emailTopicSchema) });

export type AccountEmailTopic = z.infer<typeof emailTopicSchema>;

async function accountRequest(
  origin: string,
  accessToken: string,
  path: string,
  method: 'GET' | 'PATCH' | 'POST' | 'DELETE',
  body?: AccountProfileFields | { subscribed: boolean },
  signal?: AbortSignal
) {
  const response = await fetch(new URL(path, origin), {
    method,
    headers: {
      'X-OWOX-Authorization': `Bearer ${accessToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'error',
    signal,
  });
  if (response.status === 403) throw new Error('This session cannot make changes to the account.');
  if (!response.ok) throw new Error('The account request failed. Try again.');
  return response;
}

export async function getAccountProfile(
  origin: string,
  accessToken: string,
  signal: AbortSignal
): Promise<AccountProfile> {
  const response = await accountRequest(
    origin,
    accessToken,
    '/api/account/me',
    'GET',
    undefined,
    signal
  );
  return accountProfileSchema.parse(await response.json());
}

export async function updateAccountProfile(
  origin: string,
  accessToken: string,
  fields: AccountProfileFields
): Promise<AccountProfile> {
  const response = await accountRequest(origin, accessToken, '/api/account/me', 'PATCH', fields);
  return accountProfileSchema.parse(await response.json());
}

export async function updateErasureRequest(
  origin: string,
  accessToken: string,
  requestId?: string
) {
  const path = '/api/account/me/erasure-request';
  if (requestId) {
    await accountRequest(origin, accessToken, `${path}/${encodeURIComponent(requestId)}`, 'DELETE');
  } else {
    await accountRequest(origin, accessToken, path, 'POST');
  }
}

export async function getAccountEmailPreferences(
  origin: string,
  accessToken: string,
  signal: AbortSignal
): Promise<AccountEmailTopic[]> {
  const response = await accountRequest(
    origin,
    accessToken,
    emailPreferencesPath,
    'GET',
    undefined,
    signal
  );
  return emailPreferencesSchema.parse(await response.json()).topics;
}

export async function updateAccountEmailPreference(
  origin: string,
  accessToken: string,
  { id, subscribed }: AccountEmailTopic
): Promise<void> {
  await accountRequest(
    origin,
    accessToken,
    `${emailPreferencesPath}/${encodeURIComponent(id)}`,
    'PATCH',
    {
      subscribed,
    }
  );
}
