export class ListProjectMembersCommand {
  constructor(
    public readonly projectId: string,
    public readonly failOnLookupError = false
  ) {}
}
