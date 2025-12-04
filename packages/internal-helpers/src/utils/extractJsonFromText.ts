export function extractJsonFromText(raw: string | undefined): string | null {
  if (!raw) {
    return null;
  }

  // Strip markdown fences ```json ... ``` / ``` ... ```
  const text = raw
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  // First try: whole text as JSON
  try {
    JSON.parse(text);
    return text;
  } catch {
    // ignore
  }

  // Second try: take first {...} block by braces
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  const candidate = text.slice(firstBrace, lastBrace + 1);

  try {
    JSON.parse(candidate);
    return candidate;
  } catch {
    return null;
  }
}
