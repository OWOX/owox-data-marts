export class RemoveProjectMemberCommand {
  constructor(
    public readonly projectId: string,
    public readonly actorUserId: string,
    public readonly targetUserId: string
  ) {}
}
