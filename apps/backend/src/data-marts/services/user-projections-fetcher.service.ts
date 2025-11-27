import { Injectable } from '@nestjs/common';
import { UserProjectionDto } from '../../idp/dto/domain/user-projection.dto';
import { UserProjectionsListDto } from '../../idp/dto/domain/user-projections-list.dto';
import { IdpProjectionsFacade } from '../../idp/facades/idp-projections.facade';
import { CreatorAwareEntity } from '../entities/creator-aware-entity.interface';

@Injectable()
export class UserProjectionsFetcherService {
  constructor(private readonly idpProjectionsFacade: IdpProjectionsFacade) {}

  public async fetchRelevantUserProjections(
    entities: CreatorAwareEntity[]
  ): Promise<UserProjectionsListDto> {
    return await this.idpProjectionsFacade.getUserProjectionList(
      entities.map(e => e.createdById).filter(id => id !== undefined)
    );
  }

  public async fetchUserProjection(userId: string): Promise<UserProjectionDto | undefined> {
    return await this.idpProjectionsFacade.getUserProjection(userId);
  }
}
