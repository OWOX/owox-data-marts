export class DeleteContextCommand {
  constructor(
    public readonly contextId: string,
    public readonly projectId: string
  ) {}
}
