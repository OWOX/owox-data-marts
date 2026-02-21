export class GetDestinationOAuthCredentialStatusCommand {
  constructor(
    public readonly credentialId: string,
    public readonly projectId: string
  ) {}
}
