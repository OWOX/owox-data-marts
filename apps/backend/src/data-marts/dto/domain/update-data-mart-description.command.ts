export class UpdateDataMartDescriptionCommand {
  constructor(
    public readonly id: string,
    public readonly projectId: string,
    public readonly userId: string,
    public readonly description: string
  ) {}
}
