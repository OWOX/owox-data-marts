export class GetDataMartContextsCommand {
  constructor(
    public readonly projectId: string,
    public readonly dataMartIds: string[]
  ) {}
}
