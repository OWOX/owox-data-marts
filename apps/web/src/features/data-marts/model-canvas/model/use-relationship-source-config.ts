import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useBlendedFieldsConfigEditor } from '../../edit/components/DataMartRelationships/useBlendedFieldsConfigEditor';
import { BLENDABLE_SCHEMA_QUERY_KEY } from '../../shared/hooks/blendable-schema-query-key';
import { dataMartService } from '../../shared/services/data-mart.service';

export function relationshipSourceQueryKey(sourceDataMartId: string) {
  return ['model-canvas-relationship-source', sourceDataMartId];
}

export type RelationshipConfigEditor = ReturnType<typeof useBlendedFieldsConfigEditor>;

/**
 * The source Data Mart of the relationships open in the Models canvas sheet, with the one editor
 * of its blended fields config. Every relationship of that source writes to the same config, so
 * they all share this editor and its save queue.
 */
export function useRelationshipSourceConfig(sourceDataMartId: string) {
  const queryClient = useQueryClient();
  const queryKey = relationshipSourceQueryKey(sourceDataMartId);

  const sourceQuery = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      dataMartService.getDataMartById(sourceDataMartId, {
        signal,
        skipLoadingIndicator: true,
        skipErrorToast: true,
      }),
  });

  const configEditor = useBlendedFieldsConfigEditor({
    dataMartId: sourceDataMartId,
    savedConfig: sourceQuery.data?.blendedFieldsConfig,
    onSaved: response => {
      void (async () => {
        // A refetch still on the wire was served before this save; its answer must not land
        // over the saved config.
        await queryClient.cancelQueries({ queryKey });
        queryClient.setQueryData(queryKey, response);
        void queryClient.invalidateQueries({ queryKey: [BLENDABLE_SCHEMA_QUERY_KEY] });
      })();
    },
  });

  return {
    /** Null until loaded; editing waits for it, as the whole-config saves start from it. */
    sourceDataMart: sourceQuery.data ?? null,
    isLoading: sourceQuery.isPending,
    retry: () => {
      void sourceQuery.refetch();
    },
    configEditor,
  };
}
