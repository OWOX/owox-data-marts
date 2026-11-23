import { z } from 'zod';
import apiClient, { type AxiosRequestConfig } from '../../../app/api/apiClient';
import { getTokenProvider } from '../../../app/api/token-provider';

export interface ProjectManagementSession {
  userId: string;
  projectId: string;
}

const projectPath = '/api/bi-projects';
const projectSchema = z.object({ projectId: z.string().min(1), projectTitle: z.string().min(1) });
const setupSchema = projectSchema.extend({ registrationPending: z.boolean().optional() });
const deletionSchema = z.object({ status: z.enum(['removed', 'removing']) });

export function getCloudProjectApiOrigin(flags?: Record<string, unknown> | null): string | null {
  const origin = flags?.CLOUD_PROJECT_API_ORIGIN;
  if (flags?.IDP_PROVIDER !== 'owox-better-auth' || typeof origin !== 'string') return null;
  try {
    const url = new URL(origin);
    return url.protocol === 'https:' && origin === url.origin ? origin : null;
  } catch {
    return null;
  }
}

export function isCurrentProjectSession(session: ProjectManagementSession): boolean {
  const provider = getTokenProvider();
  return (
    provider?.getUserId?.() === session.userId &&
    provider.getProjectId?.() === session.projectId &&
    Boolean(provider.getAccessToken())
  );
}

function projectRequest(origin: string, session: ProjectManagementSession): AxiosRequestConfig {
  return {
    baseURL: origin,
    expectedSession: session,
    withCredentials: false,
    skipErrorToast: true,
    skipLogoutOnUnauthorizedRetry: true,
  };
}

export async function createCloudProject(origin: string, session: ProjectManagementSession) {
  const { data } = await apiClient.post<unknown>(
    projectPath,
    undefined,
    projectRequest(origin, session)
  );
  return setupSchema.parse(data);
}

export async function registerCloudProject(
  origin: string,
  session: ProjectManagementSession,
  projectId: string
) {
  const path = `${projectPath}/${encodeURIComponent(projectId)}/registration`;
  const { data } = await apiClient.post<unknown>(path, undefined, projectRequest(origin, session));
  return setupSchema.parse(data);
}

export async function renameCloudProject(
  origin: string,
  session: ProjectManagementSession,
  title: string
) {
  const path = `${projectPath}/${encodeURIComponent(session.projectId)}`;
  const { data } = await apiClient.patch<unknown>(path, { title }, projectRequest(origin, session));
  return projectSchema.parse(data);
}

export async function deleteCloudProject(origin: string, session: ProjectManagementSession) {
  const path = `${projectPath}/${encodeURIComponent(session.projectId)}`;
  const { data } = await apiClient.delete<unknown>(path, projectRequest(origin, session));
  return deletionSchema.parse(data).status;
}
