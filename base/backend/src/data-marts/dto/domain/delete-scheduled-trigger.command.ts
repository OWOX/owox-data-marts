export class DeleteScheduledTriggerCommand {
  constructor(
    public readonly id: string,
    public readonly dataMartId: string,
    public readonly projectId: string
  ) {}
}
