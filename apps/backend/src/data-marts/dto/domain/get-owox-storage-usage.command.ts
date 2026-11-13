export class GetOwoxStorageUsageCommand {
  constructor(
    public readonly storageId: string,
    public readonly projectId: string,
    public readonly userId: string = '',
    public readonly roles: string[] = []
  ) {}
}
