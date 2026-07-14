import { Injectable } from '@nestjs/common';
import type { ProjectSettingsDto } from '../dto/domain/project-settings.dto';
import type { UpdateProjectDescriptionCommand } from '../dto/domain/update-project-description.command';
import { ProjectSettingsMapper } from '../mappers/project-settings.mapper';
import { ProjectSettingsService } from '../services/project-settings.service';

@Injectable()
export class UpdateProjectDescriptionService {
  constructor(
    private readonly projectSettingsService: ProjectSettingsService,
    private readonly mapper: ProjectSettingsMapper
  ) {}

  async run(command: UpdateProjectDescriptionCommand): Promise<ProjectSettingsDto> {
    const description = command.description?.trim() || null;
    const settings = await this.projectSettingsService.saveDescription(
      command.projectId,
      description
    );
    return this.mapper.toDomainDto(command.projectId, settings);
  }
}
