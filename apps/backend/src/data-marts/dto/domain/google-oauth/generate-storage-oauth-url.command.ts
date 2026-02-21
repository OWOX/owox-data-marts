export class GenerateStorageOAuthUrlCommand {
  constructor(
    public readonly storageId: string,
    public readonly projectId: string,
    public readonly redirectUri: string
  ) {}
}
