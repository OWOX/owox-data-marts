import { Injectable } from '@nestjs/common';
import type { GetProjectSettingsCommand } from '../dto/domain/get-project-settings.command';
import type { ProjectSettingsDto } from '../dto/domain/project-settings.dto';
import { ProjectSettingsMapper } from '../mappers/project-settings.mapper';
import { ProjectSettingsService } from '../services/project-settings.service';

@Injectable()
export class GetProjectSettingsService {
  constructor(
    private readonly projectSettingsService: ProjectSettingsService,
    private readonly mapper: ProjectSettingsMapper
  ) {}

  async run(command: GetProjectSettingsCommand): Promise<ProjectSettingsDto> {
    const settings = await this.projectSettingsService.findByProjectId(command.projectId);
    return this.mapper.toDomainDto(command.projectId, settings);
  }
}
