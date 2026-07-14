export class ProjectSettingsDto {
  constructor(
    public readonly projectId: string,
    public readonly description: string | null
  ) {}
}
