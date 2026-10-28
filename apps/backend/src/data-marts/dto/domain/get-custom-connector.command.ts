export class GetCustomConnectorCommand {
  constructor(
    public readonly projectId: string,
    public readonly connectorId: string
  ) {}
}
