export class UpdateProjectDescriptionCommand {
  constructor(
    public readonly projectId: string,
    public readonly description: string | null,
    public readonly expectedRevision?: number
  ) {}
}
