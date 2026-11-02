export class RestoreOwoxStorageCommand {
  constructor(
    public readonly storageId: string,
    public readonly projectId: string,
    public readonly userId: string = '',
    public readonly roles: string[] = [],
    public readonly fromPlugin: boolean = false
  ) {}
}
