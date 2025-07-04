export class ListScheduledTriggersCommand {
  constructor(
    public readonly dataMartId: string,
    public readonly projectId: string
  ) {}
}
