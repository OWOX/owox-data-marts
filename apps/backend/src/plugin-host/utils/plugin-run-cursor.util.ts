import { z } from 'zod';
import type { PluginRunCursor } from '../dto/domain/plugin-run.dto';

const CURSOR = z.object({ createdAt: z.string().datetime(), id: z.string().uuid() }).strict();

export function encodePluginRunCursor(cursor: PluginRunCursor): string {
  return Buffer.from(
    JSON.stringify({ createdAt: cursor.createdAt.toISOString(), id: cursor.id })
  ).toString('base64url');
}

/** Null for anything encodePluginRunCursor did not write. */
export function decodePluginRunCursor(value: string): PluginRunCursor | null {
  try {
    const parsed = CURSOR.safeParse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
    return parsed.success
      ? { createdAt: new Date(parsed.data.createdAt), id: parsed.data.id }
      : null;
  } catch {
    return null;
  }
}
