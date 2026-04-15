export class GetDataMartRunsCommand {
  constructor(
    public readonly id: string,
    public readonly projectId: string,
    public readonly limit: number,
    public readonly offset: number,
    public readonly userId: string = '',
    public readonly roles: string[] = []
  ) {}
}
