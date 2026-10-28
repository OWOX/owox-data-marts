export class DeleteCustomConnectorCommand {
  constructor(
    public readonly projectId: string,
    public readonly connectorId: string
  ) {}
}
