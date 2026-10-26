export class GetContextImpactCommand {
  constructor(
    public readonly contextId: string,
    public readonly projectId: string
  ) {}
}
