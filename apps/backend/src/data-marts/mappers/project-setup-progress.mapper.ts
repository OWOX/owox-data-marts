import { Injectable } from '@nestjs/common';
import { AuthorizationContext } from '../../idp';
import { GetProjectSetupProgressCommand } from '../dto/domain/get-project-setup-progress.command';
import { ProjectSetupProgressDto } from '../dto/domain/project-setup-progress.dto';
import { ProjectSetupSteps } from '../dto/domain/project-setup-steps.interface';
import { ProjectSetupProgressResponseApiDto } from '../dto/presentation/project-setup-progress-response-api.dto';
import { ProjectSetupProgress } from '../entities/project-setup-progress.entity';

const API_CONTRACT_VERSION = 1;

@Injectable()
export class ProjectSetupProgressMapper {
  /**
   * Build a use-case command from the auth context.
   */
  toGetCommand(context: AuthorizationContext): GetProjectSetupProgressCommand {
    return new GetProjectSetupProgressCommand(context.projectId, context.userId);
  }

  /**
   * Build the domain DTO from the persisted project row + the merged
   * (project + user) steps. `computeProgress` lives here because it is
   * pure presentation logic — counting checked boxes for the UI.
   */
  toDomainDto(
    entity: ProjectSetupProgress,
    mergedSteps: ProjectSetupSteps
  ): ProjectSetupProgressDto {
    return {
      version: API_CONTRACT_VERSION,
      stepsSchemaVersion: entity.stepsSchemaVersion,
      progress: this.computeProgress(mergedSteps),
      steps: mergedSteps,
    };
  }

  /**
   * Convert the domain DTO into the public API response. Today the shape is
   * 1:1, but we keep the conversion explicit so we can evolve the wire format
   * without touching the use-case.
   */
  toApiResponse(dto: ProjectSetupProgressDto): ProjectSetupProgressResponseApiDto {
    return {
      version: dto.version,
      stepsSchemaVersion: dto.stepsSchemaVersion,
      progress: dto.progress,
      steps: dto.steps,
    };
  }

  private computeProgress(steps: ProjectSetupSteps): number {
    const total = Object.keys(steps).length;
    if (total === 0) return 0;
    const done = Object.values(steps).filter(s => s.done).length;
    return Math.round((done / total) * 100);
  }
}
