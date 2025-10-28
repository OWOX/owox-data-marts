export class ListDataMartsByConnectorNameCommand {
  constructor(
    public readonly connectorName: string,
    public readonly projectId: string
  ) {}
}
