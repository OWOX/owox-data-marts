import { createHash } from 'node:crypto';
import type {
  SearchableDataMart,
  SearchableDataMartField,
} from '../catalog/data-mart-catalog.port';
import type {
  AtomicTokenSlot,
  EntityScoringDescriptor,
  RichTextSlot,
} from './entity-scoring-descriptor';

export interface ParsedDocument {
  richTextSlots: RichTextSlot[];
  atomicTokenSlots: AtomicTokenSlot[];
  title: string;
  description: string | null;
  embeddingText: string;
}

export function embeddingText(descriptor: EntityScoringDescriptor): string {
  return descriptor.embeddingText;
}

function nonBlank(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function formatDataMartFieldForEmbedding(field: SearchableDataMartField): string {
  const alias = nonBlank(field.alias);
  const description = nonBlank(field.description);
  const fieldLabel = alias && alias !== field.name ? `${field.name} / ${alias}` : field.name;
  return description ? `${fieldLabel}: ${description}` : fieldLabel;
}

export function buildDataMartEmbeddingText(mart: SearchableDataMart): string {
  const lines = [nonBlank(mart.title), nonBlank(mart.description)];
  const schemaLines = mart.fieldDetails.map(formatDataMartFieldForEmbedding).filter(Boolean);

  if (schemaLines.length > 0) {
    lines.push('Output schema:', ...schemaLines.map(line => `- ${line}`));
  }

  return lines.filter((line): line is string => line !== null).join('\n');
}

export function buildDocument(descriptor: EntityScoringDescriptor): string {
  return JSON.stringify({
    richTextSlots: descriptor.richTextSlots,
    atomicTokenSlots: descriptor.atomicTokenSlots,
    title: descriptor.title,
    description: descriptor.description,
    embeddingText: embeddingText(descriptor),
  });
}

export function parseDocument(doc: string): ParsedDocument {
  return JSON.parse(doc) as ParsedDocument;
}

export function indexSignature(
  descriptor: EntityScoringDescriptor,
  document: string = buildDocument(descriptor)
): string {
  return `${document} ${descriptor.fieldCount} ${descriptor.isDraft ? 1 : 0}`;
}

export function docHash(modelId: string, doc: string): string {
  return createHash('sha256').update(`${modelId}\0${doc}`).digest('hex');
}
