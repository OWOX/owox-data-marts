export class PublishCustomConnectorCommand {
  constructor(
    public readonly projectId: string,
    public readonly connectorId: string,
    public readonly userId: string,
    public readonly roles: string[]
  ) {}
}
