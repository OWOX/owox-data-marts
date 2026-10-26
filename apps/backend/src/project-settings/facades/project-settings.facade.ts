import type { ProjectSettingsDto } from '../dto/domain/project-settings.dto';

export { PROJECT_DESCRIPTION_MAX_LENGTH } from '../dto/presentation/update-project-description-api.dto';

export const PROJECT_SETTINGS_FACADE = Symbol('PROJECT_SETTINGS_FACADE');

export interface ProjectSettingsFacade {
  getDescription(projectId: string): Promise<string | null>;
  getSettings(projectId: string): Promise<ProjectSettingsDto>;
  updateDescription(
    projectId: string,
    input: { description: string | null }
  ): Promise<ProjectSettingsDto>;
}
