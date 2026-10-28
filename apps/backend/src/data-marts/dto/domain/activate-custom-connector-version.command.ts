export class ActivateCustomConnectorVersionCommand {
  constructor(
    public readonly projectId: string,
    public readonly connectorId: string,
    public readonly version: number,
    public readonly userId: string,
    public readonly roles: string[]
  ) {}
}
