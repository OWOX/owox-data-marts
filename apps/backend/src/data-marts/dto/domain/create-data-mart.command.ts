export class CreateDataMartCommand {
  constructor(
    public readonly projectId: string,
    public readonly userId: string,
    public readonly title: string,
    public readonly storageId: string
  ) {}
}
