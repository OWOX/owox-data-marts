export class UpdateProjectDescriptionCommand {
  constructor(
    public readonly projectId: string,
    public readonly description: string | null
  ) {}
}
