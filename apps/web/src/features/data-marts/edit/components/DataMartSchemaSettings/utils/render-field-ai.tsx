import type { EditableTextAction } from '@owox/ui/components/common/editable-text';
import { DataMartMetadataScope } from '../../../../shared';
import { AiHelperButton } from '../../AiHelperButton';
import type { SchemaAiHelper } from '../types/ai-helper';

/**
 * Renders the AI generate button inside a field's alias editor popover.
 *
 * Returns a render-function that receives a `setValue` helper from EditableText —
 * when the AI returns a value we write it into the editor's local buffer so the user
 * sees it in the open textarea and must explicitly Apply (or Cancel) to persist.
 *
 * Returns `undefined` when AI helper is unavailable or no field name is provided.
 */
export function renderFieldAliasAi(
  aiHelper: SchemaAiHelper | undefined,
  fieldName: string | undefined
): EditableTextAction | undefined {
  if (!aiHelper || !fieldName) return undefined;
  return ({ setValue }) => {
    const pending = aiHelper.pendingScope;
    const isLoading =
      pending !== null &&
      pending.scope === DataMartMetadataScope.FIELD_ALIAS &&
      pending.fieldName === fieldName;
    return (
      <AiHelperButton
        onClick={() => {
          void (async () => {
            const value = await aiHelper.onGenerateFieldAlias(fieldName);
            if (value) setValue(value);
          })();
        }}
        isLoading={isLoading}
        disabled={pending !== null && !isLoading}
        tooltip='Generate alias with AI'
      />
    );
  };
}

/**
 * Renders the AI generate button inside a field's description editor popover.
 *
 * See `renderFieldAliasAi` for behavior — writes the generated value into the open
 * editor's buffer instead of mutating schema state directly.
 */
export function renderFieldDescriptionAi(
  aiHelper: SchemaAiHelper | undefined,
  fieldName: string | undefined
): EditableTextAction | undefined {
  if (!aiHelper || !fieldName) return undefined;
  return ({ setValue }) => {
    const pending = aiHelper.pendingScope;
    const isLoading =
      pending !== null &&
      pending.scope === DataMartMetadataScope.FIELD_DESCRIPTION &&
      pending.fieldName === fieldName;
    return (
      <AiHelperButton
        onClick={() => {
          void (async () => {
            const value = await aiHelper.onGenerateFieldDescription(fieldName);
            if (value) setValue(value);
          })();
        }}
        isLoading={isLoading}
        disabled={pending !== null && !isLoading}
        tooltip='Generate description with AI'
      />
    );
  };
}
