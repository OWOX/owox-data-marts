export class ValidateContextIdsCommand {
  constructor(
    public readonly projectId: string,
    public readonly contextIds: string[]
  ) {}
}
