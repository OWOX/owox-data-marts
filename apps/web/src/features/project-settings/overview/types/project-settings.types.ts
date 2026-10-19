export interface ProjectSettings {
  description: string | null;
  revision: number;
}

export interface UpdateProjectDescriptionRequest {
  description: string | null;
  expectedRevision: number;
}
