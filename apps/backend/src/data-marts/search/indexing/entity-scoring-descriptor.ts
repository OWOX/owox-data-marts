import { SearchableEntityType } from '../../../common/search/search.facade';

export type RichTextSlotKind = 'title' | 'context' | 'description';
export type AtomicTokenSlotKind = 'field';

export interface RichTextSlot {
  kind: RichTextSlotKind;
  text: string;
}

export interface AtomicTokenSlot {
  kind: AtomicTokenSlotKind;
  text: string;
}

export interface EntityScoringDescriptor {
  entityType: SearchableEntityType;
  entityId: string;
  projectId: string;
  title: string;
  description: string | null;
  richTextSlots: RichTextSlot[];
  atomicTokenSlots: AtomicTokenSlot[];
  fieldCount: number;
  extendability: number;
  modifiedAt: Date;
  embeddingText: string;
  isDraft: boolean;
}
