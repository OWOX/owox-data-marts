export class RevokeStorageOAuthCommand {
  constructor(
    public readonly storageId: string,
    public readonly projectId: string
  ) {}
}
