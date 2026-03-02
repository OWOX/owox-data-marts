export class RevokeDestinationOAuthCommand {
  constructor(
    public readonly destinationId: string,
    public readonly projectId: string
  ) {}
}
