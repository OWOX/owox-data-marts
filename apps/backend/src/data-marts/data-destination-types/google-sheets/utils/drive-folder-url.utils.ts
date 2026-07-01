/**
 * Extracts a Google Drive folder ID from a pasted folder URL (or a raw ID).
 *
 * Accepts the common shapes:
 * - https://drive.google.com/drive/folders/<ID>
 * - https://drive.google.com/drive/u/0/folders/<ID>
 * - ...?id=<ID> (legacy open?id=/uc?id=)
 * - a bare <ID>
 *
 * Trailing query/hash (e.g. `?usp=sharing`) is ignored because the ID char class
 * stops at the delimiter. Returns null when nothing folder-id-like is found.
 *
 * Note: a `resourcekey` (link-shared folders) is intentionally NOT handled here —
 * the service-account flow requires the SA to be an explicit member of the Shared
 * Drive, so a resource key is not needed for access.
 */
export function extractDriveFolderId(input: string | null | undefined): string | null {
  if (!input) return null;
  let value = input.trim();
  try {
    value = decodeURIComponent(value);
  } catch {
    // keep the raw value if it is not valid percent-encoding
  }

  const fromFolders = /\/folders\/([A-Za-z0-9_-]+)/.exec(value);
  if (fromFolders) return fromFolders[1];

  const fromIdParam = /[?&]id=([A-Za-z0-9_-]+)/.exec(value);
  if (fromIdParam) return fromIdParam[1];

  const bareId = /^[A-Za-z0-9_-]+$/.exec(value);
  if (bareId) return bareId[0];

  return null;
}
