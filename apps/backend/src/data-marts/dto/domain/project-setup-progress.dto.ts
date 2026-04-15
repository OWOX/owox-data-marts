import { ProjectSetupSteps } from './project-setup-steps.interface';

/**
 * Domain-level representation of a project's setup checklist progress.
 * Returned by the `GetProjectSetupProgressService` use-case and converted
 * to the API response shape by `ProjectSetupProgressMapper.toApiResponse`.
 */
export interface ProjectSetupProgressDto {
  /** API contract version. Bump if the response shape changes incompatibly. */
  version: number;
  /** Schema version of the persisted `steps` JSON. */
  stepsSchemaVersion: number;
  /** Percentage of completed steps, 0..100, rounded. */
  progress: number;
  /** Per-step state (project-scoped + user-scoped, merged). */
  steps: ProjectSetupSteps;
}
