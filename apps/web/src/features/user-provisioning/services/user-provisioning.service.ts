import { ApiService } from '../../../services/api-service';
import type { Role } from '../../idp/types';

export interface RequestAccessContext {
  decision: 'request_access';
  user: {
    userId: string;
    email: string;
  };
  organization?: {
    name: string;
  } | null;
  project: {
    projectId: string;
    projectTitle: string;
  };
  availableRoles: Role[];
  defaultRole: Role;
  existingRequest?: {
    role: Role;
    status: string;
  } | null;
}

export interface RequestAccessResult {
  userId: string;
  projectId: string;
  projectTitle: string;
  request: {
    role: Role;
    status: string;
  };
}

export interface CreateNewProjectResult {
  projectId: string;
  projectTitle: string;
}

class UserProvisioningApiService extends ApiService {
  constructor() {
    super('/user-provisioning');
  }

  async getRequestAccessContext(): Promise<RequestAccessContext> {
    return this.get<RequestAccessContext>('/request-access-context');
  }

  async requestAccess(role: Role): Promise<RequestAccessResult> {
    return this.post<RequestAccessResult>('/request-access', { role });
  }

  async createNewProject(): Promise<CreateNewProjectResult> {
    return this.post<CreateNewProjectResult>('/create-new-project');
  }
}

export const userProvisioningService = new UserProvisioningApiService();
