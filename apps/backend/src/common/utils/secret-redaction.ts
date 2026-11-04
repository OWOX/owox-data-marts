interface SecretRedactionOptions {
  replacement: string;
  minimumSubstringLength: number;
}

/** Mask known values in JSON data. Short representations match complete values and keys only. */
export function createSecretRedactor(
  secrets: Iterable<string | number>,
  { replacement, minimumSubstringLength }: SecretRedactionOptions
): (value: unknown) => unknown {
  const whole = new Set<string>();
  const embedded = new Set<string>();
  for (const secret of secrets) {
    if (typeof secret === 'number' && !Number.isFinite(secret)) continue;
    const text = String(secret);
    if (!text || text === replacement) continue;
    const forms = new Set([text, JSON.stringify(text).slice(1, -1)]);
    try {
      forms.add(encodeURIComponent(text));
    } catch {
      // Raw and JSON-escaped values still cover unpaired Unicode surrogates.
    }
    for (const form of forms) {
      whole.add(form);
      if (form.length >= minimumSubstringLength) embedded.add(form);
    }
  }

  // Match once so overlapping secrets cannot modify a replacement already inserted.
  const pattern = embedded.size
    ? new RegExp(
        [...embedded, replacement]
          .sort((a, b) => b.length - a.length)
          .map(value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          .join('|'),
        'g'
      )
    : undefined;
  const strip = (text: string): string => {
    if (text === replacement || whole.has(text)) return replacement;
    return pattern ? text.replace(pattern, () => replacement) : text;
  };
  const redact = (value: unknown): unknown => {
    if (typeof value === 'string') return strip(value);
    if (typeof value === 'number') return whole.has(String(value)) ? replacement : value;
    if (Array.isArray(value)) return value.map(redact);
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [strip(key), redact(item)])
      );
    }
    return value;
  };
  return redact;
}
