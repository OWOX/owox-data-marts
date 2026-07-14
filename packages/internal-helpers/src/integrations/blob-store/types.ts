/** Minimal blob store contract for offloading large payloads out of inline logs. */
export interface BlobStore {
  /** Upload JSON content to the given object path. Returns a URI reference (e.g. gs://…). */
  put(path: string, json: string): Promise<string>;
}
