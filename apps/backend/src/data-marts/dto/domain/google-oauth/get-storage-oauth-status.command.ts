export class GetStorageOAuthStatusCommand {
  constructor(
    public readonly storageId: string,
    public readonly projectId: string
  ) {}
}
