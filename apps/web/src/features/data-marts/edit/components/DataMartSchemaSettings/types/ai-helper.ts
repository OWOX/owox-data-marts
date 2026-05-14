import type { PendingScope } from '../../../model/hooks';

/**
 * Per-field AI helper handlers passed down through the schema table tree.
 * `undefined` => AI helper is unavailable on this deployment and buttons must be hidden.
 *
 * `onGenerateField*` returns the generated value WITHOUT persisting it. The caller
 * (the open editor popover) is responsible for placing the value into its local
 * buffer so the user can review and explicitly Apply or Cancel.
 */
export interface SchemaAiHelper {
  pendingScope: PendingScope | null;
  onGenerateFieldAlias: (fieldName: string) => Promise<string | undefined>;
  onGenerateFieldDescription: (fieldName: string) => Promise<string | undefined>;
}
