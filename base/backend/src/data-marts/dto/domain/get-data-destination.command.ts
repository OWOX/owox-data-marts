export class GetDataDestinationCommand {
  constructor(
    public readonly id: string,
    public readonly projectId: string
  ) {}
}
