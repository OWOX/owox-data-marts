export class ListDataMartsByConnectorNameCommand {
  constructor(
    public readonly connectorName: string,
    public readonly projectId: string,
    public readonly userId: string,
    public readonly roles: string[]
  ) {}
}
