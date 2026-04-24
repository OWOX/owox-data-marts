import { DataStorageType } from '../../data-storage-types/enums/data-storage-type.enum';
import { DataStorageConfig } from '../../data-storage-types/data-storage-config.type';
import { UserProjectionDto } from '../../../idp/dto/domain/user-projection.dto';
import { ContextSummary } from '../../utils/extract-context-summaries';

export class DataStorageDto {
  constructor(
    public readonly id: string,
    public readonly title: string,
    public readonly type: DataStorageType,
    public readonly projectId: string,
    public readonly config: DataStorageConfig | undefined,
    public readonly createdAt: Date,
    public readonly modifiedAt: Date,
    public readonly dataMartsCount: number = 0,
    public readonly draftsCount: number = 0,
    public readonly credentialId: string | null | undefined = undefined,
    public readonly createdByUser: UserProjectionDto | null = null,
    public readonly ownerUsers: UserProjectionDto[] = [],
    public readonly availableForUse: boolean = true,
    public readonly availableForMaintenance: boolean = true,
    public readonly contexts: ContextSummary[] = []
  ) {}
}
