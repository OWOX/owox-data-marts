export class PublishDataStorageDraftsResultDto {
  constructor(
    public readonly successCount: number,
    public readonly failedCount: number,
    /**
     * Distinct failure reasons, without per-draft identifiers.
     *
     * Creating the trigger only requires EDIT on the storage, but the batch
     * covers every draft in it — including Data Marts the publisher may not be
     * allowed to see. Returning ids or titles here would disclose them, so only
     * the deduplicated reasons travel back. This also bounds the payload: the
     * reasons come from a fixed set rather than growing with the draft count.
     */
    public readonly failureReasons: string[] = []
  ) {}
}
