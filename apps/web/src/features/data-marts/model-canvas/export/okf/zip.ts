import { strToU8, zipSync } from 'fflate';

/** Pack OKF bundle files into a zip archive, preserving the folder layout. */
export function bundleToZip(files: Record<string, string>): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const [path, content] of Object.entries(files)) entries[path] = strToU8(content);
  return zipSync(entries, { level: 6 });
}
