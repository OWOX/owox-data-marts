export class GetScheduledTriggerCommand {
  constructor(
    public readonly id: string,
    public readonly dataMartId: string,
    public readonly projectId: string,
    public readonly userId: string,
    public readonly roles: string[]
  ) {}
}
