import {
  matchMutation,
  useMutation,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import type { DataMartResponseDto } from '../../../shared';
import { dataMartRelationshipService } from '../../../shared/services/data-mart-relationship.service';
import type {
  BlendedFieldOverride,
  BlendedFieldsConfig,
  BlendedSource,
} from '../../../shared/types/relationship.types';
import { cleanBlendedFieldOverride } from './blended-field-override.utils';
import type { SourceEntry } from './source-entries';

const DEFAULT_BLENDED_FIELDS_CONFIG: BlendedFieldsConfig = { sources: [] };

// The saves of one Data Mart's config, chained per query client. A mutation scope would also run
// them one at a time, but it holds a waiting save until the browser tab has focus again.
const saveChains = new WeakMap<QueryClient, Map<string, Promise<void>>>();

function runAfterPreviousSave<T>(
  queryClient: QueryClient,
  dataMartId: string,
  save: () => Promise<T>
): Promise<T> {
  let chains = saveChains.get(queryClient);
  if (!chains) {
    chains = new Map();
    saveChains.set(queryClient, chains);
  }
  const previous = chains.get(dataMartId) ?? Promise.resolve();
  const result = previous.then(save);
  const settled = result.then(
    () => undefined,
    () => undefined
  );
  chains.set(dataMartId, settled);
  void settled.then(() => {
    if (chains.get(dataMartId) === settled) chains.delete(dataMartId);
  });
  return result;
}

interface UseBlendedFieldsConfigEditorOptions {
  /** The Data Mart whose blended fields config is edited — the root of every join path in it. */
  dataMartId: string;
  /** The config as the server last returned it. A new value replaces the local copy. */
  savedConfig: BlendedFieldsConfig | null | undefined;
  /**
   * Receives the response of every save: the Data Mart as the server now stores it. Called even
   * after this editor unmounted, for a save it started.
   */
  onSaved: (response: DataMartResponseDto) => void;
}

/**
 * Local, optimistic copy of a Data Mart's blended fields config plus the per-join edits the
 * Report Fields and Description tabs make to it: output alias, "Allow for reporting", per-join
 * description override and per-field overrides.
 *
 * Every save PUTs the whole config, so two side by side would drop each other's edits. The
 * saves of one Data Mart are mutations that run one at a time, in the order the edits were
 * made, whichever editor made them and whether it is still mounted. An editor that mounts while
 * saves are pending starts from the newest config they carry.
 */
export function useBlendedFieldsConfigEditor({
  dataMartId,
  savedConfig,
  onSaved,
}: UseBlendedFieldsConfigEditorOptions) {
  const queryClient = useQueryClient();
  const mutationKey = useMemo(() => ['blended-fields-config', dataMartId], [dataMartId]);
  const confirmedConfig = savedConfig ?? DEFAULT_BLENDED_FIELDS_CONFIG;
  const savedConfigRef = useRef(confirmedConfig);
  savedConfigRef.current = confirmedConfig;
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  const hasPendingSave = useCallback(
    () => queryClient.isMutating({ mutationKey }) > 0,
    [queryClient, mutationKey]
  );

  const [localConfig, setLocalConfig] = useState<BlendedFieldsConfig>(() => {
    const pending = queryClient
      .getMutationCache()
      .findAll({ mutationKey, status: 'pending' })
      .at(-1)?.state.variables as BlendedFieldsConfig | undefined;
    return pending ?? confirmedConfig;
  });
  const localConfigRef = useRef(localConfig);
  useEffect(() => {
    localConfigRef.current = localConfig;
  }, [localConfig]);

  // A config that arrives while a save is still on the wire, from a refetch, predates that save.
  // Taking it would drop the edit locally, and the next whole-document save would drop it on the
  // server too. The last save's own response brings the config up to date instead.
  useEffect(() => {
    if (hasPendingSave()) return;
    setLocalConfig(confirmedConfig);
  }, [confirmedConfig, hasPendingSave]);

  // A failed save must not keep looking saved: fall back to the last config the server
  // confirmed — with every earlier save in it — unless a newer save carries the edit again.
  useEffect(
    () =>
      queryClient.getMutationCache().subscribe(event => {
        if (event.type !== 'updated' || event.action.type !== 'error') return;
        if (!matchMutation({ mutationKey }, event.mutation) || hasPendingSave()) return;
        setLocalConfig(savedConfigRef.current);
        localConfigRef.current = savedConfigRef.current;
      }),
    [queryClient, mutationKey, hasPendingSave]
  );

  const { mutate } = useMutation({
    mutationKey,
    // An autosave goes out right away; offline it fails and says so, like any request.
    networkMode: 'always',
    mutationFn: (config: BlendedFieldsConfig) =>
      runAfterPreviousSave(queryClient, dataMartId, () => {
        // A newer config waiting behind this one carries this one's edits too: skip the PUT.
        const newest = queryClient
          .getMutationCache()
          .findAll({ mutationKey, status: 'pending' })
          .at(-1)?.state.variables;
        if (newest !== undefined && newest !== config) return Promise.resolve(null);
        return dataMartRelationshipService.updateBlendedFieldsConfig(dataMartId, config, {
          skipLoadingIndicator: true,
        });
      }),
    // Every answered save becomes the confirmed config, also with a newer one still pending: a
    // failure of that newer one then falls back to this, not to the config before both.
    onSuccess: response => {
      if (response) onSavedRef.current(response);
    },
    onError: () => {
      toast.error('Failed to save changes');
    },
  });

  const saveConfigAndRefresh = useCallback(
    (newConfig: BlendedFieldsConfig) => {
      setLocalConfig(newConfig);
      // Kept in step synchronously: back-to-back edits read this ref to build the next config,
      // and the effect that mirrors state into it runs only after the re-render.
      localConfigRef.current = newConfig;
      mutate(newConfig);
    },
    [mutate]
  );

  const updateSourceConfig = useCallback(
    (path: string, updater: (current: BlendedSource | undefined) => BlendedSource) => {
      const currentConfig = localConfigRef.current;
      const existingSources = currentConfig.sources.filter(s => s.path !== path);
      const currentSource = currentConfig.sources.find(s => s.path === path);
      saveConfigAndRefresh({
        ...currentConfig,
        sources: [...existingSources, updater(currentSource)],
      });
    },
    [saveConfigAndRefresh]
  );

  const onAliasChange = useCallback(
    (source: SourceEntry, alias: string) => {
      updateSourceConfig(source.aliasPath, current => ({
        path: source.aliasPath,
        alias,
        ...(current?.isExcluded ? { isExcluded: true } : {}),
        ...(current?.description ? { description: current.description } : {}),
        ...(current?.fields ? { fields: current.fields } : {}),
      }));
    },
    [updateSourceConfig]
  );

  const onHideForReportingChange = useCallback(
    (aliasPath: string, alias: string, isHidden: boolean) => {
      updateSourceConfig(aliasPath, current => ({
        path: aliasPath,
        alias,
        ...(isHidden && { isExcluded: true }),
        ...(current?.description ? { description: current.description } : {}),
        ...(current?.fields && { fields: current.fields }),
      }));
    },
    [updateSourceConfig]
  );

  // An all-whitespace override is a cleared one: the key is removed so the join falls back
  // to the inherited relationship-level description.
  const onDescriptionOverrideChange = useCallback(
    (source: SourceEntry, description: string) => {
      updateSourceConfig(source.aliasPath, current => ({
        path: source.aliasPath,
        alias: current?.alias ?? source.alias,
        ...(current?.isExcluded ? { isExcluded: true } : {}),
        ...(description.trim() !== '' ? { description } : {}),
        ...(current?.fields ? { fields: current.fields } : {}),
      }));
    },
    [updateSourceConfig]
  );

  const onFieldOverrideChange = useCallback(
    (source: SourceEntry, fieldName: string, override: Partial<BlendedFieldOverride>) => {
      updateSourceConfig(source.aliasPath, current => {
        const currentFields = current?.fields ?? {};
        const merged: BlendedFieldOverride = {
          ...(currentFields[fieldName] ?? {}),
          ...override,
        };

        const cleanOverride = cleanBlendedFieldOverride(merged);

        const newFields: Record<string, BlendedFieldOverride> = {};
        for (const [key, val] of Object.entries(currentFields)) {
          if (key !== fieldName) newFields[key] = val;
        }
        if (Object.keys(cleanOverride).length > 0) {
          newFields[fieldName] = cleanOverride;
        }

        return {
          path: source.aliasPath,
          alias: current?.alias ?? source.alias,
          ...(current?.isExcluded ? { isExcluded: true } : {}),
          ...(current?.description ? { description: current.description } : {}),
          ...(Object.keys(newFields).length > 0 ? { fields: newFields } : {}),
        };
      });
    },
    [updateSourceConfig]
  );

  return {
    localConfig,
    /** Always the newest local config, also between a save and the re-render it causes. */
    localConfigRef,
    onAliasChange,
    onHideForReportingChange,
    onDescriptionOverrideChange,
    onFieldOverrideChange,
  };
}
