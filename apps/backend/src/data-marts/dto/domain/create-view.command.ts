export class CreateViewCommand {
  constructor(
    public readonly dataMartId: string,
    public readonly projectId: string,
    public readonly viewName: string
  ) {}
}
