import type { ProjectSettingsDto } from '../dto/domain/project-settings.dto';

export const PROJECT_SETTINGS_FACADE = Symbol('PROJECT_SETTINGS_FACADE');

export interface ProjectSettingsContext {
  projectId: string;
  userId: string;
  roles: string[];
}

export interface ProjectSettingsFacade {
  getDescription(projectId: string): Promise<string | null>;
  getSettings(ctx: ProjectSettingsContext): Promise<ProjectSettingsDto>;
  updateDescription(
    ctx: ProjectSettingsContext,
    input: { description: string | null }
  ): Promise<ProjectSettingsDto>;
}
