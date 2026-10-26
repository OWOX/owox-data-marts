export class GetDataMartMemberAccessCommand {
  constructor(
    public readonly id: string,
    public readonly projectId: string
  ) {}
}
