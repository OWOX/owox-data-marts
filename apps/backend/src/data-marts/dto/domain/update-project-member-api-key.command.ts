export class UpdateProjectMemberApiKeyCommand {
  constructor(
    public readonly projectId: string,
    public readonly userId: string,
    public readonly apiKeyId: string,
    public readonly name: string
  ) {}
}
