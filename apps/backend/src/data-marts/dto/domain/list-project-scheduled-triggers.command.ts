export class ListProjectScheduledTriggersCommand {
  constructor(
    public readonly projectId: string,
    public readonly limit: number,
    public readonly offset: number,
    public readonly userId: string,
    public readonly roles: string[] = []
  ) {}
}
