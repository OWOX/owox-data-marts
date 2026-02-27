export class GetDestinationOAuthStatusCommand {
  constructor(
    public readonly destinationId: string,
    public readonly projectId: string
  ) {}
}
