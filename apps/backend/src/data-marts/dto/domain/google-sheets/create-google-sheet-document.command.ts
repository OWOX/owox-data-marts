export class CreateGoogleSheetDocumentCommand {
  constructor(
    public readonly destinationId: string,
    public readonly projectId: string,
    public readonly title?: string,
    /** Requesting user id — used to resolve an email for sharing when not on the token. */
    public readonly requestedByUserId?: string,
    /** Requesting user email — the created document is shared with this user (best-effort). */
    public readonly userEmail?: string
  ) {}
}
