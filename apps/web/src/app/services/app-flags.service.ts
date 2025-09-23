import { ApiService } from '../../services';

export type AppSettingsResponseDto = Record<string, unknown>;

export class AppFlagsService extends ApiService {
  getFlags(): Promise<Record<string, unknown>> {
    return this.get<AppSettingsResponseDto>('/flags');
  }
}

export const appFlagsService = new AppFlagsService('');
