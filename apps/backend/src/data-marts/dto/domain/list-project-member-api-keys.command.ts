export class ListProjectMemberApiKeysCommand {
  constructor(
    public readonly projectId: string,
    public readonly userId: string,
    public readonly includeRevoked: boolean
  ) {}
}
