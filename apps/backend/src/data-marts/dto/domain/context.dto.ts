import { UserProjection } from '../schemas/user-projection.schema';
import type { DataMartIconValue } from '../../enums/data-mart-icon.enum';

export class ContextDto {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly description: string | null,
    public readonly projectId: string,
    public readonly createdById: string | null,
    public readonly createdByUser: UserProjection | null,
    public readonly createdAt: Date,
    public readonly modifiedAt: Date,
    public readonly icon: DataMartIconValue | null = null
  ) {}
}

export class ContextImpactDto {
  constructor(
    public readonly contextId: string,
    public readonly contextName: string,
    public readonly dataMartCount: number,
    public readonly storageCount: number,
    public readonly destinationCount: number,
    public readonly memberCount: number,
    public readonly userProvisioningDefaultsCount: number,
    public readonly affectedMemberIds: string[]
  ) {}
}
