import { Injectable } from '@nestjs/common';
import type { AuthorizationContext } from '../../idp';
import { GetProjectSettingsCommand } from '../dto/domain/get-project-settings.command';
import { ProjectSettingsDto } from '../dto/domain/project-settings.dto';
import { UpdateProjectDescriptionCommand } from '../dto/domain/update-project-description.command';
import type { ProjectSettingsResponseApiDto } from '../dto/presentation/project-settings-response-api.dto';
import type { UpdateProjectDescriptionApiDto } from '../dto/presentation/update-project-description-api.dto';
import type { ProjectSettings } from '../entities/project-settings.entity';

@Injectable()
export class ProjectSettingsMapper {
  toGetCommand(context: AuthorizationContext): GetProjectSettingsCommand {
    return new GetProjectSettingsCommand(context.projectId);
  }

  toUpdateDescriptionCommand(
    context: AuthorizationContext,
    dto: UpdateProjectDescriptionApiDto
  ): UpdateProjectDescriptionCommand {
    return new UpdateProjectDescriptionCommand(context.projectId, dto.description);
  }

  toDomainDto(projectId: string, entity: ProjectSettings | null): ProjectSettingsDto {
    return new ProjectSettingsDto(projectId, entity?.description ?? null);
  }

  toResponse(dto: ProjectSettingsDto): ProjectSettingsResponseApiDto {
    return { description: dto.description };
  }
}
