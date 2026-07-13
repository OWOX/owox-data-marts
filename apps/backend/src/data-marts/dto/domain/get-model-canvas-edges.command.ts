export class GetModelCanvasEdgesCommand {
  constructor(
    public readonly projectId: string,
    public readonly userId: string,
    public readonly roles: string[],
    public readonly storageId: string
  ) {}
}
