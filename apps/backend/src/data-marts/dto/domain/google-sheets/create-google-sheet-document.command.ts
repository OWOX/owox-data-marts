export class CreateGoogleSheetDocumentCommand {
  constructor(
    public readonly destinationId: string,
    public readonly projectId: string,
    public readonly title?: string
  ) {}
}
