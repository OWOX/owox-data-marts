import { ApiService } from '../../services';

export type AppSettingsResponseDto = Record<string, unknown>;

export class AppFlagsService extends ApiService {
  getFlags(): Promise<Record<string, unknown>> {
    return this.get<AppSettingsResponseDto>('/flags');
  }

  /** Public email-link pages must not invoke the authenticated client's refresh handling. */
  async getPublicFlags(signal: AbortSignal): Promise<Record<string, unknown>> {
    const base = (import.meta.env.VITE_PUBLIC_API_URL || '/api').replace(/\/$/, '');
    const response = await fetch(`${base}/flags`, {
      signal,
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    });
    if (!response.ok) throw new Error('Could not load profile settings.');
    return (await response.json()) as Record<string, unknown>;
  }
}

export const appFlagsService = new AppFlagsService('');
