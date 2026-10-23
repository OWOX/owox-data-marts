export class UpdateDataMartDescriptionCommand {
  constructor(
    public readonly id: string,
    public readonly projectId: string,
    public readonly description: string | null | undefined,
    public readonly userId: string = '',
    public readonly roles: string[] = []
  ) {}
}
