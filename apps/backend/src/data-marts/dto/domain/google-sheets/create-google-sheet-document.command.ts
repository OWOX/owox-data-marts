export class CreateGoogleSheetDocumentCommand {
  constructor(
    public readonly destinationId: string,
    public readonly projectId: string,
    public readonly title?: string,
    public readonly requestedByUserId?: string,
    /** Requesting user email — the created document is shared with this user (best-effort). */
    public readonly userEmail?: string,
    public readonly roles: string[] = []
  ) {}
}
