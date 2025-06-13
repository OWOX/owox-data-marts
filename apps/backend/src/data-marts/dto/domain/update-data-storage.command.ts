export class UpdateDataStorageCommand {
  constructor(
    public readonly credentials: Record<string, unknown>,
    public readonly config: Record<string, unknown>
  ) {}
}
