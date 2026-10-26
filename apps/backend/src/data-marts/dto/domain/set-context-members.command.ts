export class SetContextMembersCommand {
  constructor(
    public readonly contextId: string,
    public readonly projectId: string,
    public readonly assignedUserIds: string[]
  ) {}
}
