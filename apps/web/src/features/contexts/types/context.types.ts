export interface ContextDto {
  id: string;
  name: string;
  description: string | null;
  createdById: string | null;
  createdByUser: {
    userId: string;
    email: string;
    fullName?: string;
    avatar?: string;
  } | null;
  createdAt: string;
}

export interface ContextImpactDto {
  contextId: string;
  contextName: string;
  dataMartCount: number;
  storageCount: number;
  destinationCount: number;
  memberCount: number;
  affectedMemberIds: string[];
}

export interface MemberWithScopeDto {
  userId: string;
  email: string;
  displayName: string | undefined;
  avatarUrl: string | undefined;
  role: string;
  roleScope: string;
  contextIds: string[];
}

export interface ContextSummary {
  id: string;
  name: string;
}
