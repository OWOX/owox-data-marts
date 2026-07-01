export class RevokeProjectMemberApiKeyCommand {
  constructor(
    public readonly projectId: string,
    public readonly userId: string,
    public readonly apiKeyId: string
  ) {}
}
