export class DeleteDataDestinationCommand {
  constructor(
    public readonly id: string,
    public readonly projectId: string
  ) {}
}
