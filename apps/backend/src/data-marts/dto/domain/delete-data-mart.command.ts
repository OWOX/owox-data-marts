export class DeleteDataMartCommand {
  constructor(
    public readonly id: string,
    public readonly projectId: string
  ) {}
}
