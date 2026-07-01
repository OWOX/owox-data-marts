export function renderJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
