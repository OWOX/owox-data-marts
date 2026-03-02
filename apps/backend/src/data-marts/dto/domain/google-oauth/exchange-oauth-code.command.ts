export class ExchangeOAuthCodeCommand {
  constructor(
    public readonly code: string,
    public readonly state: string,
    public readonly userId: string,
    public readonly projectId: string
  ) {}
}
