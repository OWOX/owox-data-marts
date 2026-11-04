export class GetDataDestinationImpactCommand {
  constructor(
    public readonly destinationId: string,
    public readonly projectId: string,
    public readonly userId: string,
    public readonly roles: string[]
  ) {}
}
