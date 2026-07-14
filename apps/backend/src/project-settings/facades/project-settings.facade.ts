export const PROJECT_SETTINGS_FACADE = Symbol('PROJECT_SETTINGS_FACADE');

export interface ProjectSettingsFacade {
  getDescription(projectId: string): Promise<string | null>;
}
