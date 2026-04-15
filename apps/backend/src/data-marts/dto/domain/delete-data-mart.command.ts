export class DeleteDataMartCommand {
  constructor(
    public readonly id: string,
    public readonly projectId: string,
    public readonly disableLegacySync: boolean = false,
    public readonly userId: string = '',
    public readonly roles: string[] = []
  ) {}
}
