/** Trigger a browser download of a Blob under the given filename. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  // Deferred so the browser has started the download before the URL dies.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

export function slugifyFileName(text: string, fallback: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

/** `<storage-slug>-YYYY-MM-DD`, shared by every export format. */
export function buildExportFileName(storageTitle: string | undefined): string {
  const base = slugifyFileName(storageTitle ?? '', 'data-marts-model');
  const date = new Date().toISOString().slice(0, 10);
  return `${base}-${date}`;
}
