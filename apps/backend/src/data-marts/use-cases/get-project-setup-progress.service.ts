import { Injectable } from '@nestjs/common';
import { GetProjectSetupProgressCommand } from '../dto/domain/get-project-setup-progress.command';
import { ProjectSetupProgressDto } from '../dto/domain/project-setup-progress.dto';
import { ProjectSetupProgressMapper } from '../mappers/project-setup-progress.mapper';
import { ProjectSetupProgressService } from '../services/project-setup-progress.service';

/**
 * Use-case that returns the merged setup-checklist progress for a project +
 * user. All persistence, lazy-init, IDP teammate-check and per-user merging
 * lives in {@link ProjectSetupProgressService}; this use-case simply orchestrates
 * the call and hands the result to the mapper.
 */
@Injectable()
export class GetProjectSetupProgressService {
  constructor(
    private readonly progressService: ProjectSetupProgressService,
    private readonly mapper: ProjectSetupProgressMapper
  ) {}

  async run(command: GetProjectSetupProgressCommand): Promise<ProjectSetupProgressDto> {
    const { projectProgress, mergedSteps } = await this.progressService.getFullProgress(
      command.projectId,
      command.userId
    );
    return this.mapper.toDomainDto(projectProgress, mergedSteps);
  }
}
