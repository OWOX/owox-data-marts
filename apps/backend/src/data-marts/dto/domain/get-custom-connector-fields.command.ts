export class GetCustomConnectorFieldsCommand {
  constructor(
    public readonly projectId: string,
    public readonly connectorId: string,
    public readonly version?: number
  ) {}
}
