export class UpdateDataMartTitleCommand {
  constructor(
    public readonly id: string,
    public readonly projectId: string,
    public readonly title: string,
    public readonly userId: string = '',
    public readonly roles: string[] = []
  ) {}
}
