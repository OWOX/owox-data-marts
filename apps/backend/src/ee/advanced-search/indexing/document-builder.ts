import { createHash } from 'node:crypto';
import type { SearchableDataMart } from '../catalog/data-mart-catalog.port';

export function buildDocument(m: SearchableDataMart): string {
  const fieldLine = m.fieldNames.join(', ');
  return [m.title, m.description, ...m.contexts.map(c => c.content), fieldLine]
    .filter(Boolean)
    .join('\n');
}

export function docHash(modelId: string, doc: string): string {
  return createHash('sha256').update(`${modelId}\0${doc}`).digest('hex');
}
