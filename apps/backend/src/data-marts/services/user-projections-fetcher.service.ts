import { Injectable } from '@nestjs/common';
import { UserProjectionDto } from '../../idp/dto/domain/user-projection.dto';
import { UserProjectionsListDto } from '../../idp/dto/domain/user-projections-list.dto';
import { IdpProjectionsFacade } from '../../idp/facades/idp-projections.facade';
import { CreatorAwareEntity } from '../entities/creator-aware-entity.interface';
import { DataMart } from '../entities/data-mart.entity';

@Injectable()
export class UserProjectionsFetcherService {
  constructor(private readonly idpProjectionsFacade: IdpProjectionsFacade) {}

  public async fetchRelevantUserProjections(
    entities: CreatorAwareEntity[]
  ): Promise<UserProjectionsListDto> {
    const userIds = [
      ...new Set(
        entities.map(e => e.createdById).filter((id): id is string => typeof id === 'string')
      ),
    ];
    return await this.idpProjectionsFacade.getUserProjectionList(userIds);
  }

  public async fetchAllRelevantUserProjections(
    dataMarts: DataMart[]
  ): Promise<UserProjectionsListDto> {
    const userIds = new Set<string>();
    for (const dm of dataMarts) {
      if (dm.createdById) {
        userIds.add(dm.createdById);
      }
      for (const id of dm.businessOwnerIds ?? []) {
        userIds.add(id);
      }
      for (const id of dm.technicalOwnerIds ?? []) {
        userIds.add(id);
      }
    }
    return await this.idpProjectionsFacade.getUserProjectionList(Array.from(userIds));
  }

  public async fetchUserProjection(userId: string): Promise<UserProjectionDto | undefined> {
    return await this.idpProjectionsFacade.getUserProjection(userId);
  }

  public async fetchCreatedByUser(entity: CreatorAwareEntity): Promise<UserProjectionDto | null> {
    if (!entity.createdById) return null;
    return (await this.fetchUserProjection(entity.createdById)) ?? null;
  }
}
