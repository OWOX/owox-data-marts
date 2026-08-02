/**
 * The tightest identifier length any supported warehouse imposes: Redshift's
 * `max_identifier_length`, in BYTES. Redshift does not reject a longer name — it silently
 * TRUNCATES it, which is the dangerous half: two distinct names can come back as one.
 */
export const MAX_IDENTIFIER_BYTES = 127;

/** UTF-8 byte length — the unit warehouses measure identifiers in, unlike JS string length. */
export function identifierByteLength(name: string): number {
  return Buffer.byteLength(name, 'utf8');
}

/**
 * `name` cut the way a warehouse cuts an over-long identifier: to a BYTE budget, never landing
 * inside a multi-byte character (the cut backs off over UTF-8 continuation bytes). Returns the
 * name unchanged when it already fits, so the common path allocates nothing.
 */
export function truncateIdentifierToByteLimit(
  name: string,
  maxBytes: number = MAX_IDENTIFIER_BYTES
): string {
  const bytes = Buffer.from(name, 'utf8');
  if (bytes.length <= maxBytes) return name;
  let end = maxBytes;
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end--;
  return bytes.toString('utf8', 0, end);
}
