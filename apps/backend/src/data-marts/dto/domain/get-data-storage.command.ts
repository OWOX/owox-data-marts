export class GetDataStorageCommand {
  constructor(
    public readonly id: string,
    public readonly projectId: string
  ) {}
}
