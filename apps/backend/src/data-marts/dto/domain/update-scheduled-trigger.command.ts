export class UpdateScheduledTriggerCommand {
  constructor(
    public readonly id: string,
    public readonly dataMartId: string,
    public readonly projectId: string,
    public readonly cronExpression: string,
    public readonly timeZone: string,
    public readonly isActive: boolean
  ) {}
}
