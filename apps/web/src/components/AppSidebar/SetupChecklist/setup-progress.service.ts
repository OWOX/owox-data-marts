import { ApiService } from '../../../services/api-service';
import type { ProjectSetupResponse } from './types';

class SetupProgressService extends ApiService {
  constructor() {
    super('/project-setup-progress');
  }

  async getProgress(): Promise<ProjectSetupResponse> {
    return this.get<ProjectSetupResponse>('');
  }
}

export const setupProgressService = new SetupProgressService();
