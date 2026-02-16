import { Injectable } from '@nestjs/common';
import { ProjectProjectionDto } from '../dto/domain/project-projection.dto';
import { UserProjectionDto } from '../dto/domain/user-projection.dto';
import { UserProjectionsListDto } from '../dto/domain/user-projections-list.dto';
import { ProjectionsMapper } from '../mappers/projections.mapper';
import { IdpProjectionsService } from '../services/idp-projections.service';
import { ProjectMemberDto } from '../dto/domain/project-member.dto';

/**
 * A facade service that provides methods to retrieve projections
 * for projects and users using the underlying IdpProjectionsService and ProjectionsMapper.
 */
@Injectable()
export class IdpProjectionsFacade {
  constructor(
    private readonly idpProjectionsService: IdpProjectionsService,
    private readonly mapper: ProjectionsMapper
  ) {}

  public async getProjectProjection(projectId: string): Promise<ProjectProjectionDto | undefined> {
    const projection = await this.idpProjectionsService.getProjectProjection(projectId);
    if (projection) {
      return this.mapper.toProjectProjectionDto(projection);
    }
  }

  public async getUserProjection(userId: string): Promise<UserProjectionDto | undefined> {
    const projection = await this.idpProjectionsService.getUserProjection(userId);
    if (projection) {
      return this.mapper.toUserProjectionDto(projection);
    }
  }

  public async getUserProjectionList(userIds: string[]): Promise<UserProjectionsListDto> {
    const projections = await this.idpProjectionsService.getUserProjectionList(userIds);
    return this.mapper.toUserProjectionDtoList(projections);
  }

  public async getProjectMembers(projectId: string): Promise<ProjectMemberDto[]> {
    return this.idpProjectionsService.getProjectMembers(projectId);
  }
}
