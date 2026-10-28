export class SaveCustomConnectorDraftCommand {
  constructor(
    public readonly projectId: string,
    public readonly connectorId: string,
    public readonly manifest: Record<string, unknown>
  ) {}
}
