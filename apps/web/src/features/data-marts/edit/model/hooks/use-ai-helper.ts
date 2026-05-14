import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import { extractApiError } from '../../../../../app/api';
import { trackEvent } from '../../../../../utils';
import { dataMartService, DataMartMetadataScope } from '../../../shared';
import type {
  GenerateDataMartMetadataResponseDto,
  GeneratedFieldMetadataDto,
} from '../../../shared/types/api';

const DEFAULT_USE_SAMPLE = true;

export interface UseAiHelperResult {
  /** Which scope is currently being generated, or null. */
  pendingScope: PendingScope | null;
  generateTitle: (dataMartId: string) => Promise<string | undefined>;
  generateDescription: (dataMartId: string) => Promise<string | undefined>;
  generateFieldAlias: (dataMartId: string, fieldName: string) => Promise<string | undefined>;
  generateFieldDescription: (dataMartId: string, fieldName: string) => Promise<string | undefined>;
  generateAllFieldDescriptions: (
    dataMartId: string
  ) => Promise<GeneratedFieldMetadataDto[] | undefined>;
  generateAllFieldAliases: (dataMartId: string) => Promise<GeneratedFieldMetadataDto[] | undefined>;
  generateAllFieldMetadata: (
    dataMartId: string
  ) => Promise<GeneratedFieldMetadataDto[] | undefined>;
}

export type PendingScope =
  | { scope: DataMartMetadataScope.TITLE }
  | { scope: DataMartMetadataScope.DESCRIPTION }
  | { scope: DataMartMetadataScope.FIELD_ALIAS; fieldName: string }
  | { scope: DataMartMetadataScope.FIELD_DESCRIPTION; fieldName: string }
  | { scope: DataMartMetadataScope.ALL_FIELD_DESCRIPTIONS }
  | { scope: DataMartMetadataScope.ALL_FIELD_ALIASES }
  | { scope: DataMartMetadataScope.ALL_FIELD_METADATA };

function isFieldScopedPending(
  pending: PendingScope
): pending is Extract<
  PendingScope,
  { scope: DataMartMetadataScope.FIELD_ALIAS | DataMartMetadataScope.FIELD_DESCRIPTION }
> {
  return (
    pending.scope === DataMartMetadataScope.FIELD_ALIAS ||
    pending.scope === DataMartMetadataScope.FIELD_DESCRIPTION
  );
}

/**
 * Calls the AI helper backend endpoint and returns suggested metadata.
 *
 * This hook does NOT persist suggestions — callers apply them via the
 * existing update endpoints (or push them into local schema state).
 */
export function useAiHelper(): UseAiHelperResult {
  const [pendingScope, setPendingScope] = useState<PendingScope | null>(null);

  const generate = useCallback(
    async (
      dataMartId: string,
      pending: PendingScope
    ): Promise<GenerateDataMartMetadataResponseDto | undefined> => {
      setPendingScope(pending);
      try {
        const fieldName = isFieldScopedPending(pending) ? pending.fieldName : undefined;

        const result = await dataMartService.generateDataMartMetadata(dataMartId, {
          scope: pending.scope,
          useSample: DEFAULT_USE_SAMPLE,
          fieldName,
        });

        trackEvent({
          event: 'data_mart_ai_metadata_generated',
          category: 'DataMart',
          action: 'GenerateMetadata',
          label: pending.scope,
          context: dataMartId,
        });

        return result;
      } catch (error) {
        const apiError = extractApiError(error);
        trackEvent({
          event: 'data_mart_error',
          category: 'DataMart',
          action: 'GenerateMetadataError',
          label: pending.scope,
          context: dataMartId,
          error: apiError.message,
        });
        return undefined;
      } finally {
        setPendingScope(null);
      }
    },
    []
  );

  const generateTitle = useCallback(
    async (dataMartId: string) => {
      const result = await generate(dataMartId, { scope: DataMartMetadataScope.TITLE });
      return result?.title?.trim();
    },
    [generate]
  );

  const generateDescription = useCallback(
    async (dataMartId: string) => {
      const result = await generate(dataMartId, { scope: DataMartMetadataScope.DESCRIPTION });
      return result?.description?.trim();
    },
    [generate]
  );

  const generateFieldAlias = useCallback(
    async (dataMartId: string, fieldName: string) => {
      const result = await generate(dataMartId, {
        scope: DataMartMetadataScope.FIELD_ALIAS,
        fieldName,
      });
      const match = result?.fields?.find(f => f.name === fieldName);
      const alias = match?.alias?.trim();
      if (!alias) {
        toast.error('AI returned no alias suggestion. Try again or fill it in manually.');
        return undefined;
      }
      return alias;
    },
    [generate]
  );

  const generateFieldDescription = useCallback(
    async (dataMartId: string, fieldName: string) => {
      const result = await generate(dataMartId, {
        scope: DataMartMetadataScope.FIELD_DESCRIPTION,
        fieldName,
      });
      const match = result?.fields?.find(f => f.name === fieldName);
      const description = match?.description?.trim();
      if (!description) {
        toast.error('AI returned no description suggestion. Try again or fill it in manually.');
        return undefined;
      }
      return description;
    },
    [generate]
  );

  const generateAllFieldDescriptions = useCallback(
    async (dataMartId: string) => {
      const result = await generate(dataMartId, {
        scope: DataMartMetadataScope.ALL_FIELD_DESCRIPTIONS,
      });
      const fields = result?.fields ?? [];
      if (fields.length === 0) {
        toast.error('AI returned no field descriptions. Try again or fill them in manually.');
        return undefined;
      }
      return fields;
    },
    [generate]
  );

  const generateAllFieldAliases = useCallback(
    async (dataMartId: string) => {
      const result = await generate(dataMartId, {
        scope: DataMartMetadataScope.ALL_FIELD_ALIASES,
      });
      const fields = result?.fields ?? [];
      if (fields.length === 0) {
        toast.error('AI returned no field aliases. Try again or fill them in manually.');
        return undefined;
      }
      return fields;
    },
    [generate]
  );

  const generateAllFieldMetadata = useCallback(
    async (dataMartId: string) => {
      const result = await generate(dataMartId, {
        scope: DataMartMetadataScope.ALL_FIELD_METADATA,
      });
      const fields = result?.fields ?? [];
      if (fields.length === 0) {
        toast.error('AI returned no field metadata. Try again or fill it in manually.');
        return undefined;
      }
      return fields;
    },
    [generate]
  );

  return {
    pendingScope,
    generateTitle,
    generateDescription,
    generateFieldAlias,
    generateFieldDescription,
    generateAllFieldDescriptions,
    generateAllFieldAliases,
    generateAllFieldMetadata,
  };
}
