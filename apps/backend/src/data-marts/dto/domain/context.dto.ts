export class ContextDto {
  id: string;
  name: string;
  description: string | null;
  projectId: string;
  createdById: string | null;
  createdByUser: { userId: string; email: string; fullName?: string; avatar?: string } | null;
  createdAt: Date;
}

export class ContextImpactDto {
  contextId: string;
  contextName: string;
  dataMartCount: number;
  storageCount: number;
  destinationCount: number;
  memberCount: number;
  affectedMemberIds: string[];
}
