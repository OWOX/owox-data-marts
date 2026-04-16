export class DeleteDataDestinationCommand {
  constructor(
    public readonly id: string,
    public readonly projectId: string,
    public readonly userId: string = '',
    public readonly roles: string[] = []
  ) {}
}
