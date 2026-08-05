/** Render a flat object as OKF YAML frontmatter lines (scalars and string arrays only). */
export function renderFrontmatter(values: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) lines.push(`${key}: [${value.map(scalar).join(', ')}]`);
    else lines.push(`${key}: ${scalar(value)}`);
  }
  return lines.join('\n');
}

function scalar(value: unknown): string {
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ')}"`;
}
