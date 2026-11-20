import { z } from 'zod';
import apiClient, { type AxiosRequestConfig } from '../../app/api/apiClient';

export interface AccountSession {
  projectId: string;
  userId: string;
}

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
  session: AccountSession,
  path: string,
  method: 'GET' | 'PATCH' | 'POST' | 'DELETE',
  body?: AccountProfileFields | { subscribed: boolean },
  signal?: AbortSignal
) {
  const config: AxiosRequestConfig = {
    url: path,
    method,
    baseURL: origin,
    headers: method === 'GET' ? { 'Content-Type': null } : undefined,
    data: body,
    withCredentials: false,
    skipErrorToast: true,
    skipLogoutOnUnauthorizedRetry: true,
    expectedSession: session,
    signal,
  };
  return apiClient.request<unknown>(config);
}

export async function getAccountProfile(
  origin: string,
  session: AccountSession,
  signal: AbortSignal
): Promise<AccountProfile> {
  const response = await accountRequest(
    origin,
    session,
    '/api/account/me',
    'GET',
    undefined,
    signal
  );
  return accountProfileSchema.parse(response.data);
}

export async function getAccountPersonalData(
  origin: string,
  session: AccountSession
): Promise<unknown> {
  const response = await accountRequest(origin, session, '/api/account/me/personal-data', 'GET');
  return response.data;
}

export async function updateAccountProfile(
  origin: string,
  session: AccountSession,
  fields: AccountProfileFields
): Promise<AccountProfile> {
  const response = await accountRequest(origin, session, '/api/account/me', 'PATCH', fields);
  return accountProfileSchema.parse(response.data);
}

export async function updateErasureRequest(
  origin: string,
  session: AccountSession,
  requestId?: string
) {
  const path = '/api/account/me/erasure-request';
  if (requestId) {
    await accountRequest(origin, session, `${path}/${encodeURIComponent(requestId)}`, 'DELETE');
  } else {
    await accountRequest(origin, session, path, 'POST');
  }
}

export async function getAccountEmailPreferences(
  origin: string,
  session: AccountSession,
  signal: AbortSignal
): Promise<AccountEmailTopic[]> {
  const response = await accountRequest(
    origin,
    session,
    emailPreferencesPath,
    'GET',
    undefined,
    signal
  );
  return emailPreferencesSchema.parse(response.data).topics;
}

export async function updateAccountEmailPreference(
  origin: string,
  session: AccountSession,
  { id, subscribed }: AccountEmailTopic
): Promise<void> {
  await accountRequest(
    origin,
    session,
    `${emailPreferencesPath}/${encodeURIComponent(id)}`,
    'PATCH',
    {
      subscribed,
    }
  );
}
