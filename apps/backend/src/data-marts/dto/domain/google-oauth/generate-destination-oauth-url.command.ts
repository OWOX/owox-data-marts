export class GenerateDestinationOAuthUrlCommand {
  constructor(
    public readonly projectId: string,
    public readonly redirectUri: string,
    public readonly destinationId?: string
  ) {}
}
