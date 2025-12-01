import { Injectable } from '@nestjs/common';
import { ProjectProjectionDto } from '../dto/domain/project-projection.dto';
import { UserProjectionDto } from '../dto/domain/user-projection.dto';
import { UserProjectionsListDto } from '../dto/domain/user-projections-list.dto';
import { ProjectProjection } from '../entities/project-projection.entity';
import { UserProjection } from '../entities/user-projection.entity';

@Injectable()
export class ProjectionsMapper {
  toUserProjectionDto(userProjection: UserProjection): UserProjectionDto {
    return new UserProjectionDto(
      userProjection.userId,
      userProjection.fullName,
      userProjection.email,
      userProjection.avatar
    );
  }

  toUserProjectionDtoList(userProjections: UserProjection[]): UserProjectionsListDto {
    return new UserProjectionsListDto(userProjections.map(this.toUserProjectionDto));
  }

  toProjectProjectionDto(projectProjection: ProjectProjection): ProjectProjectionDto {
    return new ProjectProjectionDto(projectProjection.projectId, projectProjection.projectTitle);
  }
}
