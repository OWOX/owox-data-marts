export class DeclineMembershipRequestCommand {
  constructor(
    public readonly projectId: string,
    public readonly actorUserId: string,
    public readonly requestId: string
  ) {}
}
