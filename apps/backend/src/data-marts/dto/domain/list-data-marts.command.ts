export class ListDataMartsCommand {
  constructor(
    public readonly projectId: string,
    public readonly connectorName?: string
  ) {}
}
